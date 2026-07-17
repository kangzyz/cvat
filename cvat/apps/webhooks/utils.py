# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import hashlib
import hmac
import json
from dataclasses import dataclass
from http import HTTPStatus
from urllib.parse import quote, urlparse

import requests

from cvat.apps.engine import utils as engine_utils
from cvat.apps.engine.models import RequestSubresource, Task
from cvat.apps.engine.rq import ExportRequestId
from cvat.apps.engine.serializers import BasicUserSerializer
from cvat.apps.events.handlers import get_request, get_user
from cvat.utils.http import PROXIES_FOR_UNTRUSTED_URLS, make_requests_session

from .event_type import event_name
from .models import Webhook

_WEBHOOK_TIMEOUT = 10
_RESPONSE_SIZE_LIMIT = 1 * 1024 * 1024  # 1 MB
_WECOM_WEBHOOK_HOST = "qyapi.weixin.qq.com"
_WECOM_WEBHOOK_PATH = "/cgi-bin/webhook/send"
_WECOM_MARKDOWN_CONTENT_LIMIT = 4096
_WECOM_MARKDOWN_VALUE_LIMIT = 1024
_WECOM_ACTION_LABELS = {
    "create": "创建",
    "update": "更新",
    "delete": "删除",
}
_WECOM_RESOURCE_LABELS = {
    "project": "项目",
    "task": "任务",
    "job": "作业",
    "label": "标签",
    "issue": "问题",
    "comment": "评论",
    "organization": "组织",
    "invitation": "邀请",
    "membership": "成员",
    "export": "导出",
    "backup": "备份",
    "webhook": "Webhook",
}
_WECOM_FIELD_LABELS = {
    "id": "ID",
    "name": "名称",
    "description": "描述",
    "status": "状态",
    "stage": "阶段",
    "state": "状态",
    "assignee": "负责人",
    "owner": "所有者",
    "created_date": "创建日期",
    "updated_date": "更新日期",
    "assignee_updated_date": "负责人更新日期",
    "task_id": "任务 ID",
    "task_name": "任务名称",
    "project_id": "项目 ID",
    "project_name": "项目名称",
    "type": "类型",
    "dimension": "维度",
    "mode": "模式",
    "media_type": "媒体类型",
    "subset": "子集",
    "organization": "组织",
    "organization_id": "组织 ID",
    "validation_mode": "验证模式",
    "resolved": "是否解决",
    "message": "消息",
    "role": "角色",
}
_WECOM_DETAIL_VALUE_LABELS = {
    "status": {
        "annotation": "标注",
        "validation": "验证",
        "completed": "已完成",
        "succeeded": "成功",
        "failed": "失败",
    },
    "stage": {
        "annotation": "标注",
        "validation": "验证",
        "acceptance": "验收",
    },
    "state": {
        "new": "新建",
        "in progress": "进行中",
        "rejected": "已拒绝",
        "completed": "已完成",
    },
}

# Only these fields turn a Task/Job update into an operational milestone worth notifying.
# Derived Job ``status`` and metadata (dates, names, descriptions) never qualify on their own.
_WECOM_MILESTONE_FIELDS = {
    "task": frozenset({"status", "assignee"}),
    "job": frozenset({"stage", "state", "assignee"}),
}
_WECOM_STATUS_ORDER = {"annotation": 0, "validation": 1, "completed": 2}
_WECOM_STAGE_ORDER = {"annotation": 0, "validation": 1, "acceptance": 2}
_WECOM_MARKERS = {
    "start": "▶️",
    "move": "🔄",
    "done": "✅",
    "reject": "⚠️",
    "assignee": "👤",
    "create": "🆕",
    "delete": "🗑️",
}


@dataclass(frozen=True)
class WeComDeliveryPlan:
    """Provider-only decision computed per Webhook immediately before queueing.

    ``presentation`` is passed to the delivery job separately from the native payload so the
    original event dictionary persisted in ``WebhookDelivery.request`` is never mutated.
    """

    should_enqueue: bool
    presentation: dict | None


def plan_wecom_delivery(
    webhook: Webhook, payload: dict, *, redelivery: bool = False
) -> WeComDeliveryPlan:
    """Decide whether a Webhook target should receive this event and with what extra context.

    The calculation is explicitly per Webhook, not per event: generic receivers and non-Task/Job
    WeCom events always enqueue with no presentation override. Only automatic WeCom
    ``update:task``/``update:job`` events without a milestone field are suppressed; manual
    redelivery bypasses suppression.
    """
    if not _is_wecom_webhook_url(webhook.target_url):
        return WeComDeliveryPlan(should_enqueue=True, presentation=None)

    event = str(payload.get("event") or "")
    action, _, resource = event.partition(":")

    if (
        not redelivery
        and event in ("update:task", "update:job")
        and not _has_wecom_milestone_field(resource, payload.get("before_update"))
    ):
        return WeComDeliveryPlan(should_enqueue=False, presentation=None)

    return WeComDeliveryPlan(
        should_enqueue=True,
        presentation=_build_wecom_presentation(action, resource, payload),
    )


def _has_wecom_milestone_field(resource: str, before_update) -> bool:
    if not isinstance(before_update, dict):
        return False

    milestone_fields = _WECOM_MILESTONE_FIELDS.get(resource, frozenset())
    return any(field in before_update for field in milestone_fields)


def _build_wecom_presentation(action: str, resource: str, payload: dict) -> dict | None:
    # Only Task-level milestones carry an aggregate Job-progress snapshot, captured at event time
    # so a queued delivery can never combine an old transition with a later progress count.
    if resource != "task" or action not in ("create", "update"):
        return None

    task = payload.get("task")
    if not isinstance(task, dict):
        return None

    progress = _fetch_task_progress(task.get("id"))
    if progress is None:
        return None

    return {"task_progress": progress}


def _fetch_task_progress(task_id) -> dict | None:
    if not isinstance(task_id, int) or isinstance(task_id, bool):
        return None

    try:
        task = Task.objects.with_job_summary().filter(pk=task_id).first()
    except Exception:  # noqa: BLE001 - progress is best-effort and must never fail the webhook
        return None

    if task is None:
        return None

    return {
        "total": task.total_jobs_count,
        "completed": task.completed_jobs_count,
        "validation": task.validation_jobs_count,
    }


def get_sender(instance) -> dict:
    user = get_user(instance)
    if isinstance(user, dict):
        return user

    return BasicUserSerializer(user, context={"request": get_request(instance)}).data


def get_event_name_and_webhook_payload_from_export_request(
    request: ExportRequestId,
    status: engine_utils.RequestStatusEnum,
    message: str,
) -> tuple[str, dict]:
    match request.subresource:
        case RequestSubresource.DATASET | RequestSubresource.ANNOTATIONS:
            _event_name = event_name(action="create", resource="export")
            subresource_data = {"format": request.format}
        case RequestSubresource.BACKUP:
            _event_name = event_name(action="create", resource="backup")
            # NOTE @sosov: RequestId omits falsey fields, but webhook payloads should
            # preserve the default regular-backup value as false.
            subresource_data = {
                "lightweight": (request.lightweight if request.lightweight is not None else False)
            }
        case _:
            raise NotImplementedError(
                f"Webhook for subresource {request.subresource} is not implemented"
            )

    webhook_payload = {
        "event": _event_name,
        "status": status.value,
        "target": request.target,
        "target_id": request.target_id,
        "rq_id": request.render(),
        "message": message,
        **subresource_data,
    }

    return _event_name, webhook_payload


def _truncate_utf8(value: str, limit: int) -> str:
    encoded_value = value.encode("utf-8")
    if len(encoded_value) <= limit:
        return value

    suffix = "…"
    encoded_suffix = suffix.encode("utf-8")
    if limit < len(encoded_suffix):
        return encoded_value[:limit].decode("utf-8", errors="ignore")

    return encoded_value[: limit - len(encoded_suffix)].decode("utf-8", errors="ignore") + suffix


def _is_wecom_webhook_url(url: str) -> bool:
    try:
        parsed_url = urlparse(url)
        return (
            parsed_url.hostname is not None
            and parsed_url.hostname.lower() == _WECOM_WEBHOOK_HOST
            and parsed_url.path.rstrip("/") == _WECOM_WEBHOOK_PATH
        )
    except ValueError:
        return False


def _format_wecom_markdown_value(value) -> str:
    text = " ".join(str(value).split())
    text = text.replace("`", "'").replace("<", "‹").replace(">", "›")
    return _truncate_utf8(text, _WECOM_MARKDOWN_VALUE_LIMIT)


def _append_wecom_markdown_detail(lines: list[str], label: str, value) -> None:
    if value is None or value == "":
        return

    lines.append(f"> {label}：`{_format_wecom_markdown_value(value)}`")


def _format_wecom_event(event: str) -> str:
    if event == "ping":
        return "连通性测试"

    action, separator, resource_name = event.partition(":")
    if not separator:
        return event

    action_label = _WECOM_ACTION_LABELS.get(action)
    resource_label = _WECOM_RESOURCE_LABELS.get(resource_name)
    if action_label is None or resource_label is None:
        return event

    return f"{action_label}{resource_label}"


def _translate_wecom_detail_value(field: str, value):
    if field == "lightweight" and isinstance(value, bool):
        return "是" if value else "否"

    labels = _WECOM_DETAIL_VALUE_LABELS.get(field)
    if labels is None:
        return value

    return labels.get(str(value), value)


def _format_wecom_changed_fields(before_update: dict) -> str:
    return "、".join(_WECOM_FIELD_LABELS.get(str(field), str(field)) for field in before_update)


def _get_wecom_resource(payload: dict, event: str) -> tuple[str, dict | None]:
    if event == "ping":
        resource_name = "webhook"
    else:
        _, separator, resource_name = event.partition(":")
        if not separator:
            resource_name = ""

    resource = payload.get(resource_name)
    return resource_name, resource if isinstance(resource, dict) else None


def _get_wecom_sender_name(payload: dict):
    sender = payload.get("sender")
    if not isinstance(sender, dict):
        return None

    if sender.get("username"):
        return sender["username"]

    full_name = " ".join(
        value for value in (sender.get("first_name"), sender.get("last_name")) if value
    )
    return full_name or sender.get("id")


def _get_wecom_resource_url(resource_name: str, resource: dict | None) -> str | None:
    if resource is None or not isinstance(resource.get("url"), str):
        return None

    url = resource["url"].strip()
    try:
        parsed_url = urlparse(url)
    except ValueError:
        return None

    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        return None

    resource_id = str(resource.get("id", ""))
    task_id = str(resource.get("task_id", ""))
    if resource_name == "project" and resource_id.isdecimal():
        page_path = f"/projects/{resource_id}"
    elif resource_name == "task" and resource_id.isdecimal():
        page_path = f"/tasks/{resource_id}"
    elif resource_name == "job" and resource_id.isdecimal() and task_id.isdecimal():
        page_path = f"/tasks/{task_id}/jobs/{resource_id}"
    elif resource_name == "invitation":
        page_path = "/invitations"
    elif resource_name in {"organization", "membership"}:
        page_path = "/organization"
    else:
        return quote(url, safe=":/?&=#%+,-._~")

    path_prefix, separator, _ = parsed_url.path.partition("/api/")
    if not separator:
        path_prefix = ""

    # The serializer URL is request-derived. Replace only its route so deployments keep the
    # externally visible scheme, host, port, query, and optional path prefix.
    page_url = parsed_url._replace(
        path=f"{path_prefix.rstrip('/')}{page_path}",
        params="",
        fragment="",
    ).geturl()
    return quote(page_url, safe=":/?&=#%+,-._~")


def _build_wecom_payload(
    payload: dict, presentation: dict | None = None, redelivery: bool = False
) -> dict:
    event = str(payload.get("event") or "unknown")
    _, separator, resource = event.partition(":")

    if separator and resource in ("task", "job"):
        content = _build_wecom_workflow_content(event, resource, payload, presentation, redelivery)
    else:
        content = _build_wecom_generic_content(payload)

    content = _truncate_utf8(content, _WECOM_MARKDOWN_CONTENT_LIMIT)
    return {
        "msgtype": "markdown",
        "markdown": {
            "content": content,
        },
    }


def _build_wecom_generic_content(payload: dict) -> str:
    event = str(payload.get("event") or "unknown")
    resource_name, resource = _get_wecom_resource(payload, event)

    lines = ["### CVAT 通知"]
    _append_wecom_markdown_detail(lines, "事件", _format_wecom_event(event))

    if resource_name:
        resource_label = _WECOM_RESOURCE_LABELS.get(resource_name, resource_name)
        if resource is not None and resource.get("id") is not None:
            resource_label = f"{resource_label} #{resource['id']}"
        _append_wecom_markdown_detail(lines, "资源", resource_label)

    if resource is not None:
        for key, label in (
            ("name", "名称"),
            ("description", "描述"),
            ("status", "状态"),
            ("stage", "阶段"),
            ("state", "进度"),
        ):
            value = _translate_wecom_detail_value(key, resource.get(key))
            _append_wecom_markdown_detail(lines, label, value)
    else:
        target = payload.get("target")
        target_id = payload.get("target_id")
        if target is not None:
            target_label = _WECOM_RESOURCE_LABELS.get(str(target), str(target))
            if target_id is not None:
                target_label = f"{target_label} #{target_id}"
            _append_wecom_markdown_detail(lines, "目标", target_label)
        elif target_id is not None:
            _append_wecom_markdown_detail(lines, "目标 ID", target_id)

        for key, label in (
            ("status", "状态"),
            ("format", "格式"),
            ("lightweight", "轻量备份"),
            ("rq_id", "请求 ID"),
            ("message", "消息"),
        ):
            value = _translate_wecom_detail_value(key, payload.get(key))
            _append_wecom_markdown_detail(lines, label, value)

    _append_wecom_markdown_detail(lines, "操作人", _get_wecom_sender_name(payload))

    before_update = payload.get("before_update")
    if isinstance(before_update, dict) and before_update:
        _append_wecom_markdown_detail(
            lines,
            "变更字段",
            _format_wecom_changed_fields(before_update),
        )

    if resource_url := _get_wecom_resource_url(resource_name, resource):
        lines.append(f"[查看详情]({resource_url})")

    return "\n".join(lines)


def _wecom_enum_label(field: str, value):
    if value is None:
        return None

    labels = _WECOM_DETAIL_VALUE_LABELS.get(field, {})
    return labels.get(str(value), str(value))


def _wecom_user_label(user) -> str:
    if not isinstance(user, dict):
        return "未分配"

    # Chinese display order is family name followed by given name. Keep the text compact and add
    # an @ prefix so the responsible person stands out in the operational feed.
    full_name = "".join(
        str(value).strip() for value in (user.get("last_name"), user.get("first_name")) if value
    )
    if full_name:
        return f"@{full_name}"
    if user.get("username"):
        return f"@{user['username']}"
    if user.get("id") is not None:
        return f"@用户 #{user['id']}"
    return "未分配"


def _wecom_breadcrumb_node(label: str, name, resource_id) -> str:
    if name:
        return f"{_format_wecom_markdown_value(name)} (#{resource_id})"
    if resource_id is not None:
        return f"{label} #{resource_id}"
    return label


def _wecom_breadcrumb(resource: str, data: dict) -> str:
    project_id = data.get("project_id")
    if project_id is not None:
        segments = [_wecom_breadcrumb_node("项目", data.get("project_name"), project_id)]
    else:
        segments = ["独立任务"]

    if resource == "job":
        segments.append(_wecom_breadcrumb_node("任务", data.get("task_name"), data.get("task_id")))
        job_id = data.get("id")
        segments.append(f"作业 #{job_id}" if job_id is not None else "作业")
    else:
        segments.append(_wecom_breadcrumb_node("任务", data.get("name"), data.get("id")))

    return " / ".join(segments)


def _append_wecom_transition_row(lines: list[str], label: str, old_value, new_value, field: str):
    new_text = _wecom_enum_label(field, new_value)
    if new_text is None:
        return

    if old_value is None or old_value == new_value:
        lines.append(f"> {label}：`{_format_wecom_markdown_value(new_text)}`")
        return

    old_text = _wecom_enum_label(field, old_value)
    lines.append(
        f"> {label}："
        f"`{_format_wecom_markdown_value(old_text)}` → `{_format_wecom_markdown_value(new_text)}`"
    )


def _append_wecom_assignee_row(lines: list[str], data: dict, before_update: dict):
    new_label = _wecom_user_label(data.get("assignee"))
    if "assignee" in before_update:
        old_label = _wecom_user_label(before_update.get("assignee"))
        lines.append(
            f"> 负责人："
            f"`{_format_wecom_markdown_value(old_label)}` → `{_format_wecom_markdown_value(new_label)}`"
        )
    elif data.get("assignee"):
        lines.append(f"> 负责人：`{_format_wecom_markdown_value(new_label)}`")


def _append_wecom_progress_row(lines: list[str], progress) -> None:
    if not isinstance(progress, dict) or progress.get("total") is None:
        return

    text = f"总计 {progress['total']}"
    if progress.get("completed") is not None:
        text += f"，最终完成 {progress['completed']}"
    if progress.get("validation") is not None:
        text += f"，验证阶段 {progress['validation']}"
    lines.append(f"> 作业进度：`{text}`")


def _classify_wecom_job_update(new: dict, before_update: dict) -> tuple[str, str, list[str]]:
    stage_changed = "stage" in before_update
    state_changed = "state" in before_update
    assignee_changed = "assignee" in before_update

    new_stage = new.get("stage")
    old_stage = before_update.get("stage") if stage_changed else new_stage
    new_state = new.get("state")
    old_state = before_update.get("state") if state_changed else new_state
    stage_label = _wecom_enum_label("stage", new_stage) or "当前"
    order = _WECOM_STAGE_ORDER
    markers = _WECOM_MARKERS

    rows: list[str] = []
    if stage_changed:
        _append_wecom_transition_row(rows, "阶段", old_stage, new_stage, "stage")
    if state_changed:
        _append_wecom_transition_row(rows, "状态", old_state, new_state, "state")

    if state_changed and new_state == "rejected":
        return markers["reject"], "作业被拒绝，已退回", rows
    if stage_changed and order.get(new_stage, -1) < order.get(old_stage, -1):
        return markers["move"], f"作业退回到{stage_label}阶段", rows
    if state_changed and old_state == "completed" and new_state in ("new", "in progress"):
        return markers["move"], "作业已重新开启", rows
    if stage_changed and order.get(new_stage, -1) > order.get(old_stage, -1):
        return markers["move"], f"作业进入{stage_label}阶段", rows
    if state_changed and new_state == "in progress" and old_state in ("new", "rejected"):
        verb = "重新开始" if old_state == "rejected" else "开始"
        return markers["start"], f"{verb}{stage_label}", rows
    if state_changed and new_state == "completed":
        conclusion = {
            "annotation": "标注已提交",
            "validation": "验证已完成",
            "acceptance": "作业已验收（最终完成）",
        }.get(new_stage, "作业已完成")
        return markers["done"], conclusion, rows
    if assignee_changed:
        return markers["assignee"], "作业负责人变更", rows

    return markers["move"], "作业信息已更新", rows


def _classify_wecom_task_update(new: dict, before_update: dict) -> tuple[str, str, list[str]]:
    status_changed = "status" in before_update
    assignee_changed = "assignee" in before_update
    new_status = new.get("status")
    old_status = before_update.get("status") if status_changed else new_status
    order = _WECOM_STATUS_ORDER
    markers = _WECOM_MARKERS

    rows: list[str] = []
    if status_changed:
        _append_wecom_transition_row(rows, "状态", old_status, new_status, "status")

    if status_changed and old_status != new_status:
        if order.get(new_status, -1) < order.get(old_status, -1):
            if old_status == "completed":
                return markers["move"], "任务已重新开启", rows
            status_label = _wecom_enum_label("status", new_status) or "当前"
            return markers["move"], f"任务退回到{status_label}阶段", rows
        if new_status == "completed":
            return markers["done"], "任务已完成", rows
        status_label = _wecom_enum_label("status", new_status) or "当前"
        return markers["move"], f"任务进入{status_label}阶段", rows

    if assignee_changed:
        return markers["assignee"], "任务负责人变更", rows

    return markers["move"], "任务信息已更新", rows


def _classify_wecom_transition(
    action: str, resource: str, new: dict, before_update: dict
) -> tuple[str, str, list[str]]:
    if action == "create":
        rows: list[str] = []
        if resource == "job":
            _append_wecom_transition_row(rows, "阶段", None, new.get("stage"), "stage")
            _append_wecom_transition_row(rows, "状态", None, new.get("state"), "state")
        else:
            _append_wecom_transition_row(rows, "状态", None, new.get("status"), "status")
        label = _WECOM_RESOURCE_LABELS.get(resource, resource)
        return _WECOM_MARKERS["create"], f"{label}已创建", rows

    if action == "delete":
        label = _WECOM_RESOURCE_LABELS.get(resource, resource)
        return _WECOM_MARKERS["delete"], f"{label}已删除", []

    if resource == "job":
        return _classify_wecom_job_update(new, before_update)
    return _classify_wecom_task_update(new, before_update)


def _build_wecom_workflow_content(
    event: str,
    resource: str,
    payload: dict,
    presentation: dict | None,
    redelivery: bool = False,
) -> str:
    action, _, _ = event.partition(":")
    data = _get_wecom_resource(payload, event)[1] or {}
    before_update = payload.get("before_update")
    before_update = before_update if isinstance(before_update, dict) else {}

    lines = [f"### {_wecom_breadcrumb(resource, data)}"]

    marker, conclusion, rows = _classify_wecom_transition(action, resource, data, before_update)
    # A manual redelivery bypasses suppression, so a historical metadata-only payload can reach the
    # formatter with no classifiable milestone. Announce the replay explicitly instead of implying a
    # transition that did not happen.
    if (
        redelivery
        and action == "update"
        and not _has_wecom_milestone_field(resource, before_update)
    ):
        marker, conclusion = _WECOM_MARKERS["move"], "手动重投递（无里程碑变更）"
    lines.append(f"{marker} {conclusion}")
    lines.extend(rows)

    if action != "delete":
        _append_wecom_assignee_row(lines, data, before_update)

    if presentation:
        _append_wecom_progress_row(lines, presentation.get("task_progress"))

    _append_wecom_markdown_detail(lines, "操作人", _get_wecom_sender_name(payload))

    if resource_url := _get_wecom_resource_url(resource, data):
        lines.append(f"[查看详情]({resource_url})")

    return "\n".join(lines)


def _normalize_wecom_status(status_code: int, response: str) -> int:
    if not 200 <= status_code < 300:
        return status_code

    try:
        response_data = json.loads(response)
    except (TypeError, json.JSONDecodeError):
        return HTTPStatus.BAD_GATEWAY

    errcode = response_data.get("errcode") if isinstance(response_data, dict) else None
    if isinstance(errcode, int) and not isinstance(errcode, bool) and errcode == 0:
        return status_code

    return HTTPStatus.BAD_GATEWAY


def perform_webhook_request(
    webhook: Webhook,
    payload: dict,
    presentation: dict | None = None,
    redelivery: bool = False,
) -> tuple[int, str]:
    is_wecom_webhook = _is_wecom_webhook_url(webhook.target_url)
    try:
        request_payload = (
            _build_wecom_payload(payload, presentation, redelivery) if is_wecom_webhook else payload
        )

        headers: dict[str, str] = {}
        if webhook.secret and not is_wecom_webhook:
            headers["X-Signature-256"] = (
                "sha256="
                + hmac.new(
                    webhook.secret.encode("utf-8"),
                    json.dumps(payload).encode("utf-8"),
                    digestmod=hashlib.sha256,
                ).hexdigest()
            )

        with make_requests_session() as session:
            response = session.post(
                webhook.target_url,
                json=request_payload,
                verify=webhook.enable_ssl,
                headers=headers,
                timeout=_WEBHOOK_TIMEOUT,
                stream=True,
                proxies=PROXIES_FOR_UNTRUSTED_URLS,
            )
            status_code = response.status_code
            response_body = response.raw.read(_RESPONSE_SIZE_LIMIT + 1, decode_content=True)

        response = ""
        if response_body is not None and len(response_body) < _RESPONSE_SIZE_LIMIT + 1:
            response = response_body.decode("utf-8", errors="replace")

        if is_wecom_webhook:
            status_code = _normalize_wecom_status(status_code, response)

        return status_code, response
    except requests.ConnectionError as ex:
        response = "WeCom webhook connection failed" if is_wecom_webhook else str(ex)
        return HTTPStatus.BAD_GATEWAY, response
    except requests.Timeout as ex:
        response = "WeCom webhook request timed out" if is_wecom_webhook else str(ex)
        return HTTPStatus.GATEWAY_TIMEOUT, response
