# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import hashlib
import hmac
import json
from http import HTTPStatus
from urllib.parse import quote, urlparse

import requests

from cvat.apps.engine import utils as engine_utils
from cvat.apps.engine.models import RequestSubresource
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


def _get_wecom_resource_url(resource: dict | None) -> str | None:
    if resource is None or not isinstance(resource.get("url"), str):
        return None

    url = resource["url"].strip()
    try:
        parsed_url = urlparse(url)
    except ValueError:
        return None

    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        return None

    return quote(url, safe=":/?&=#%+,-._~")


def _build_wecom_payload(payload: dict) -> dict:
    event = str(payload.get("event") or "unknown")
    resource_name, resource = _get_wecom_resource(payload, event)

    lines = ["### CVAT 通知"]
    _append_wecom_markdown_detail(lines, "事件", event)

    if resource_name:
        resource_label = resource_name
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
            _append_wecom_markdown_detail(lines, label, resource.get(key))
    else:
        target = payload.get("target")
        target_id = payload.get("target_id")
        if target is not None:
            target_label = str(target)
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
            _append_wecom_markdown_detail(lines, label, payload.get(key))

    _append_wecom_markdown_detail(lines, "操作人", _get_wecom_sender_name(payload))

    before_update = payload.get("before_update")
    if isinstance(before_update, dict) and before_update:
        _append_wecom_markdown_detail(lines, "变更字段", ", ".join(before_update))

    if resource_url := _get_wecom_resource_url(resource):
        lines.append(f"[查看详情]({resource_url})")

    content = _truncate_utf8("\n".join(lines), _WECOM_MARKDOWN_CONTENT_LIMIT)
    return {
        "msgtype": "markdown",
        "markdown": {
            "content": content,
        },
    }


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


def perform_webhook_request(webhook: Webhook, payload: dict) -> tuple[int, str]:
    is_wecom_webhook = _is_wecom_webhook_url(webhook.target_url)
    try:
        request_payload = _build_wecom_payload(payload) if is_wecom_webhook else payload

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
