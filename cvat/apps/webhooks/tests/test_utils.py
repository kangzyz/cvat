# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import hashlib
import hmac
import json
from copy import deepcopy
from http import HTTPStatus
from unittest.mock import MagicMock, patch

import requests
from django.test import TestCase

from cvat.apps.webhooks.utils import perform_webhook_request

from .utils import make_webhook, payload


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

    def test_wecom_request_uses_markdown_envelope(self) -> None:
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
        assert "事件：`update:task`" in content
        assert "资源：`task #42`" in content
        assert "名称：`training 'set' ‹@all› second line`" in content
        assert "状态：`annotation`" in content
        assert "操作人：`alice`" in content
        assert "变更字段：`name, status`" in content
        assert "[查看详情](https://cvat.example/api/tasks/42)" in content
        assert "<@all>" not in content

    def test_wecom_markdown_content_has_utf8_byte_limit(self) -> None:
        self.webhook.target_url = self.WECOM_URL
        oversized_value = "测" * 5000
        event_payload = {
            "event": "update:task",
            "task": {
                "id": 42,
                "name": oversized_value,
                "description": oversized_value,
                "status": oversized_value,
                "stage": oversized_value,
                "state": oversized_value,
            },
            "before_update": {oversized_value: "old value"},
            "sender": {"username": oversized_value},
        }

        perform_webhook_request(self.webhook, event_payload)

        content = self.session.post.call_args.kwargs["json"]["markdown"]["content"]
        assert len(content.encode("utf-8")) <= 4096
        assert content.startswith("### CVAT 通知\n> 事件：`update:task`")
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
