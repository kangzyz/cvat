# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import hashlib
import hmac
import json
from copy import deepcopy
from http import HTTPStatus
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import requests
from django.test import SimpleTestCase, TestCase

from cvat.apps.webhooks.utils import (
    _build_wecom_payload,
    perform_webhook_request,
    plan_wecom_delivery,
)

from .utils import make_webhook, payload

WECOM_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"


def _wecom_content(
    event_payload: dict, presentation: dict | None = None, redelivery: bool = False
) -> str:
    return _build_wecom_payload(event_payload, presentation, redelivery)["markdown"]["content"]


class TestPerformWebhookRequest(TestCase):
    WECOM_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"

    @classmethod
    def setUpTestData(cls) -> None:
        cls.webhook = make_webhook()

    def setUp(self) -> None:
        patcher = patch("cvat.apps.webhooks.utils.make_requests_session")
        self.make_session = patcher.start()
        self.addCleanup(patcher.stop)

        self.session = self.make_session.return_value.__enter__.return_value
        self.response = MagicMock()
        self.response.status_code = HTTPStatus.OK
        self.response.raw.read.return_value = b'{"errcode":0,"errmsg":"ok"}'
        self.session.post.return_value = self.response

    def test_wecom_task_milestone_uses_workflow_layout(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        self.webhook.secret = "must-not-be-sent"
        event_payload = {
            "event": "update:task",
            "task": {
                "id": 42,
                "name": "training `set` <@all>\nsecond line",
                "status": "annotation",
                "url": "https://cvat.example/api/tasks/42",
            },
            "before_update": {"name": "old name", "status": "validation"},
            "sender": {"username": "alice"},
        }
        original_payload = deepcopy(event_payload)

        status_code, response = perform_webhook_request(self.webhook, event_payload)

        assert status_code == HTTPStatus.OK
        assert response == '{"errcode":0,"errmsg":"ok"}'
        assert event_payload == original_payload

        request_kwargs = self.session.post.call_args.kwargs
        assert request_kwargs["headers"] == {}
        assert request_kwargs["json"]["msgtype"] == "markdown"
        content = request_kwargs["json"]["markdown"]["content"]
        # Breadcrumb heading (standalone task) + sanitized current name.
        assert content.startswith("### 独立任务 / training 'set' ‹@all› second line (#42)\n")
        # Conclusion-first, then the old-to-new status transition only.
        assert "🔄 任务退回到标注阶段" in content
        assert "状态：`验证` → `标注`" in content
        assert "操作人：`alice`" in content
        assert "[查看详情](https://cvat.example/tasks/42)" in content
        # Old presentation noise is gone.
        assert "事件：" not in content
        assert "变更字段" not in content
        assert "<@all>" not in content

    def test_wecom_job_milestone_uses_chinese_wording_and_frontend_url(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        event_payload = {
            "event": "update:job",
            "job": {
                "id": 1,
                "task_id": 7,
                "status": "validation",
                "stage": "validation",
                "state": "completed",
                "url": "https://123.123.123.123:8080/api/jobs/1",
            },
            "before_update": {"state": "in progress", "updated_date": "old date"},
            "sender": {"username": "admin"},
        }

        status_code, _response = perform_webhook_request(self.webhook, event_payload)

        assert status_code == HTTPStatus.OK
        content = self.session.post.call_args.kwargs["json"]["markdown"]["content"]
        assert content.startswith("### 独立任务 / 任务 #7 / 作业 #1\n")
        assert "✅ 验证已完成" in content
        assert "状态：`进行中` → `已完成`" in content
        assert "操作人：`admin`" in content
        assert "[查看详情](https://123.123.123.123:8080/tasks/7/jobs/1)" in content

    def test_wecom_markdown_content_has_utf8_byte_limit(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        oversized_value = "测" * 5000
        event_payload = {
            "event": "update:job",
            "job": {
                "id": 1,
                "task_id": 7,
                "project_id": 3,
                "project_name": oversized_value,
                "task_name": oversized_value,
                "stage": "validation",
                "state": "completed",
                "assignee": {"id": 9, "username": oversized_value},
            },
            "before_update": {
                "state": "in progress",
                "assignee": {"id": 8, "username": oversized_value},
            },
            "sender": {"username": oversized_value},
        }

        perform_webhook_request(self.webhook, event_payload)

        content = self.session.post.call_args.kwargs["json"]["markdown"]["content"]
        assert len(content.encode("utf-8")) <= 4096
        assert content.startswith("### ")
        assert content.endswith("…")

    def test_wecom_nonzero_errcode_is_bad_gateway(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        self.response.raw.read.return_value = b'{"errcode":93000,"errmsg":"invalid webhook"}'

        status_code, response = perform_webhook_request(self.webhook, payload())

        assert status_code == HTTPStatus.BAD_GATEWAY
        assert response == '{"errcode":93000,"errmsg":"invalid webhook"}'

    def test_wecom_malformed_response_is_bad_gateway(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        self.response.raw.read.return_value = b"not json"

        status_code, response = perform_webhook_request(self.webhook, payload())

        assert status_code == HTTPStatus.BAD_GATEWAY
        assert response == "not json"

    def test_wecom_non_2xx_status_is_preserved(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        self.response.status_code = HTTPStatus.TOO_MANY_REQUESTS
        self.response.raw.read.return_value = b'{"errcode":45009,"errmsg":"rate limit"}'

        status_code, _response = perform_webhook_request(self.webhook, payload())

        assert status_code == HTTPStatus.TOO_MANY_REQUESTS

    def test_similar_non_wecom_url_preserves_native_payload_and_hmac(self) -> None:
        self.webhook.target_url = (
            "https://qyapi.weixin.qq.com.example.com/cgi-bin/webhook/send?key=test-key"
        )
        self.webhook.secret = "secret"
        self.webhook.enable_ssl = False
        event_payload = payload()
        self.response.status_code = HTTPStatus.CREATED
        self.response.raw.read.return_value = b"generic receiver response"
        expected_signature = (
            "sha256="
            + hmac.new(
                self.webhook.secret.encode("utf-8"),
                json.dumps(event_payload).encode("utf-8"),
                digestmod=hashlib.sha256,
            ).hexdigest()
        )

        status_code, response = perform_webhook_request(self.webhook, event_payload)

        assert status_code == HTTPStatus.CREATED
        assert response == "generic receiver response"
        request_kwargs = self.session.post.call_args.kwargs
        assert request_kwargs["json"] is event_payload
        assert request_kwargs["headers"] == {"X-Signature-256": expected_signature}
        assert request_kwargs["verify"] is False

    def test_connection_error_is_bad_gateway(self) -> None:
        self.session.post.side_effect = requests.ConnectionError("connection failed")

        status_code, response = perform_webhook_request(self.webhook, payload())

        assert status_code == HTTPStatus.BAD_GATEWAY
        assert response == "connection failed"

    def test_wecom_connection_error_does_not_expose_secret_url(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        self.session.post.side_effect = requests.ConnectionError(
            f"connection failed for {self.WECOM_URL}"
        )

        status_code, response = perform_webhook_request(self.webhook, payload())

        assert status_code == HTTPStatus.BAD_GATEWAY
        assert response == "WeCom webhook connection failed"
        assert "test-key" not in response

    def test_timeout_is_gateway_timeout(self) -> None:
        self.session.post.side_effect = requests.Timeout("request timed out")

        status_code, response = perform_webhook_request(self.webhook, payload())

        assert status_code == HTTPStatus.GATEWAY_TIMEOUT
        assert response == "request timed out"

    def test_wecom_timeout_does_not_expose_secret_url(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        self.session.post.side_effect = requests.Timeout(f"request timed out for {self.WECOM_URL}")

        status_code, response = perform_webhook_request(self.webhook, payload())

        assert status_code == HTTPStatus.GATEWAY_TIMEOUT
        assert response == "WeCom webhook request timed out"
        assert "test-key" not in response


def _job(new: dict, before_update: dict | None = None, **extra) -> dict:
    return {
        "event": "update:job",
        "job": {"id": 1, "task_id": 7, **new},
        "before_update": before_update or {},
        "sender": {"username": "admin"},
        **extra,
    }


def _task(new: dict, before_update: dict | None = None, **extra) -> dict:
    return {
        "event": "update:task",
        "task": {"id": 7, **new},
        "before_update": before_update or {},
        "sender": {"username": "admin"},
        **extra,
    }


class TestWeComWorkflowFormatter(SimpleTestCase):
    def test_job_forward_stage_movement(self) -> None:
        content = _wecom_content(
            _job(
                {"stage": "validation", "state": "new"},
                {"stage": "annotation", "state": "in progress"},
            )
        )
        assert "🔄 作业进入验证阶段" in content
        assert "阶段：`标注` → `验证`" in content
        assert "状态：`进行中` → `新建`" in content

    def test_job_backward_stage_movement(self) -> None:
        content = _wecom_content(
            _job({"stage": "annotation", "state": "new"}, {"stage": "validation"})
        )
        assert "🔄 作业退回到标注阶段" in content

    def test_job_rejection(self) -> None:
        content = _wecom_content(
            _job({"stage": "validation", "state": "rejected"}, {"state": "in progress"})
        )
        assert "⚠️ 作业被拒绝，已退回" in content
        assert "状态：`进行中` → `已拒绝`" in content

    def test_job_reopen(self) -> None:
        content = _wecom_content(
            _job({"stage": "annotation", "state": "in progress"}, {"state": "completed"})
        )
        assert "🔄 作业已重新开启" in content

    def test_job_start(self) -> None:
        content = _wecom_content(
            _job({"stage": "annotation", "state": "in progress"}, {"state": "new"})
        )
        assert "▶️ 开始标注" in content

    def test_job_annotation_submitted(self) -> None:
        content = _wecom_content(
            _job({"stage": "annotation", "state": "completed"}, {"state": "in progress"})
        )
        assert "✅ 标注已提交" in content

    def test_job_final_acceptance(self) -> None:
        content = _wecom_content(
            _job({"stage": "acceptance", "state": "completed"}, {"state": "in progress"})
        )
        assert "✅ 作业已验收（最终完成）" in content

    def test_job_assignee_uses_at_prefixed_family_name_first(self) -> None:
        content = _wecom_content(
            _job(
                {
                    "stage": "annotation",
                    "state": "new",
                    "assignee": {"id": 9, "first_name": "大鹏", "last_name": "卫"},
                },
                {"assignee": None},
            )
        )
        assert "👤 作业负责人变更" in content
        assert "负责人：`未分配` → `@卫大鹏`" in content

    def test_task_assignee_uses_at_prefixed_username_fallback(self) -> None:
        content = _wecom_content(
            _task(
                {
                    "status": "annotation",
                    "assignee": {"id": 9, "username": "dapeng.wei"},
                },
                {"assignee": None},
            )
        )
        assert "负责人：`未分配` → `@dapeng.wei`" in content

    def test_task_assignee_uses_at_prefixed_id_fallback(self) -> None:
        content = _wecom_content(
            _task(
                {"status": "annotation", "assignee": {"id": 9}},
                {"assignee": None},
            )
        )
        assert "负责人：`未分配` → `@用户 #9`" in content

    def test_task_completion_with_progress_snapshot(self) -> None:
        content = _wecom_content(
            _task(
                {"status": "completed", "name": "T", "project_id": 3, "project_name": "P"},
                {"status": "validation"},
            ),
            presentation={"task_progress": {"total": 5, "completed": 5, "validation": 0}},
        )
        assert content.startswith("### P (#3) / T (#7)\n")
        assert "✅ 任务已完成" in content
        assert "状态：`验证` → `已完成`" in content
        assert "作业进度：`总计 5，最终完成 5，验证阶段 0`" in content

    def test_task_standalone_breadcrumb(self) -> None:
        content = _wecom_content(
            _task({"status": "validation", "name": "T"}, {"status": "annotation"})
        )
        assert content.startswith("### 独立任务 / T (#7)\n")

    def test_job_create(self) -> None:
        content = _wecom_content(
            {
                "event": "create:job",
                "job": {"id": 1, "task_id": 7, "stage": "annotation", "state": "new"},
                "sender": {"username": "admin"},
            }
        )
        assert "🆕 作业已创建" in content

    def test_task_delete_omits_progress(self) -> None:
        content = _wecom_content(
            {
                "event": "delete:task",
                "task": {"id": 7, "name": "T", "status": "completed"},
                "sender": {"username": "admin"},
            }
        )
        assert "🗑️ 任务已删除" in content
        assert "作业进度" not in content

    def test_unknown_enum_value_is_preserved(self) -> None:
        content = _wecom_content(_job({"stage": "annotation", "state": "future"}, {"state": "new"}))
        assert "`future`" in content

    def test_manual_redelivery_of_metadata_only_update_is_explicit(self) -> None:
        content = _wecom_content(
            _job({"stage": "annotation", "state": "new"}, {"updated_date": "old"}),
            redelivery=True,
        )
        assert "🔄 手动重投递（无里程碑变更）" in content

    def test_milestone_redelivery_keeps_transition_conclusion(self) -> None:
        content = _wecom_content(
            _job({"stage": "annotation", "state": "completed"}, {"state": "in progress"}),
            redelivery=True,
        )
        assert "✅ 标注已提交" in content
        assert "手动重投递" not in content


class TestWeComDeliveryPlan(SimpleTestCase):
    @staticmethod
    def _webhook(url: str = WECOM_URL) -> SimpleNamespace:
        return SimpleNamespace(target_url=url)

    def test_generic_target_always_enqueues_without_presentation(self) -> None:
        plan = plan_wecom_delivery(
            self._webhook("http://example.invalid/payload"),
            _job({"stage": "annotation"}, {"updated_date": "old"}),
        )
        assert plan.should_enqueue is True
        assert plan.presentation is None

    def test_metadata_only_job_update_is_suppressed(self) -> None:
        plan = plan_wecom_delivery(
            self._webhook(), _job({"stage": "annotation"}, {"updated_date": "old"})
        )
        assert plan.should_enqueue is False

    def test_job_milestone_enqueues_without_presentation(self) -> None:
        plan = plan_wecom_delivery(
            self._webhook(), _job({"stage": "annotation", "state": "completed"}, {"state": "new"})
        )
        assert plan.should_enqueue is True
        assert plan.presentation is None

    def test_metadata_only_task_update_is_suppressed(self) -> None:
        plan = plan_wecom_delivery(self._webhook(), _task({"name": "T"}, {"name": "old"}))
        assert plan.should_enqueue is False

    @patch("cvat.apps.webhooks.utils._fetch_task_progress")
    def test_task_milestone_attaches_progress_presentation(self, fetch: MagicMock) -> None:
        fetch.return_value = {"total": 5, "completed": 2, "validation": 1}

        plan = plan_wecom_delivery(
            self._webhook(), _task({"status": "completed"}, {"status": "validation"})
        )

        assert plan.should_enqueue is True
        assert plan.presentation == {"task_progress": {"total": 5, "completed": 2, "validation": 1}}

    def test_redelivery_bypasses_suppression(self) -> None:
        plan = plan_wecom_delivery(
            self._webhook(),
            _job({"stage": "annotation"}, {"updated_date": "old"}),
            redelivery=True,
        )
        assert plan.should_enqueue is True

    def test_non_task_job_wecom_event_enqueues(self) -> None:
        plan = plan_wecom_delivery(
            self._webhook(),
            {"event": "create:project", "project": {"id": 1}, "sender": {}},
        )
        assert plan.should_enqueue is True
        assert plan.presentation is None
