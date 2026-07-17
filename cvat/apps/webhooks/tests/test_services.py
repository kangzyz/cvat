# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from http import HTTPStatus
from unittest.mock import MagicMock, patch

from django.test import TestCase

from cvat.apps.webhooks.models import WebhookDelivery
from cvat.apps.webhooks.services import redeliver, send_webhook

from .utils import make_webhook, payload

WECOM_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"


class TestSendWebhook(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        cls.webhook = make_webhook()

    @patch("cvat.apps.webhooks.utils.perform_webhook_request")
    def test_creates_delivery_with_request_result(self, perform: MagicMock) -> None:
        perform.return_value = (HTTPStatus.INTERNAL_SERVER_ERROR, "consumer failed")

        delivery = send_webhook(webhook=self.webhook, payload=payload(), attempt=2, redelivery=True)

        assert delivery.status_code == HTTPStatus.INTERNAL_SERVER_ERROR
        assert delivery.response == "consumer failed"
        assert delivery.redelivery is True
        assert delivery.event == "update:project"
        assert delivery.attempt == 2
        assert delivery.request_duration >= 0
        assert WebhookDelivery.objects.get() == delivery

    @patch("cvat.apps.webhooks.utils.perform_webhook_request")
    def test_presentation_is_forwarded_but_not_persisted(self, perform: MagicMock) -> None:
        perform.return_value = (HTTPStatus.OK, "")
        presentation = {"task_progress": {"total": 5, "completed": 2, "validation": 1}}
        event_payload = payload()

        delivery = send_webhook(
            webhook=self.webhook, payload=event_payload, attempt=1, presentation=presentation
        )

        assert perform.call_args.kwargs["presentation"] == presentation
        # The native payload persisted in delivery history must never carry provider presentation.
        assert delivery.request == event_payload
        assert "task_progress" not in delivery.request


class TestRedeliver(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        cls.webhook = make_webhook()
        cls.webhook.target_url = WECOM_URL

    @patch("cvat.apps.webhooks.services.add_to_queue")
    def test_redelivery_bypasses_milestone_suppression(self, enqueue: MagicMock) -> None:
        # A metadata-only historical delivery would be suppressed automatically, but an explicit
        # administrator redelivery must still be enqueued.
        data = {
            "event": "update:job",
            "job": {"id": 1, "task_id": 7, "stage": "annotation", "state": "new"},
            "before_update": {"updated_date": "old date"},
            "sender": {"username": "admin"},
        }

        redeliver(webhook=self.webhook, data=data)

        enqueue.assert_called_once()
        assert enqueue.call_args.kwargs["redelivery"] is True
