# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from rq import Retry

from cvat.apps.webhooks.dispatch import add_to_queue, batch_add_to_queue
from cvat.apps.webhooks.tasks import send_webhook

from .utils import make_webhook, payload

WECOM_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"


class TestAddToQueue(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        cls.webhook = make_webhook()

    @override_settings(SEND_WEBHOOK_TASK_RETRIES=[1, 2, 3])
    @patch("cvat.apps.webhooks.dispatch.django_rq.get_queue")
    def test_passes_send_webhook_with_retry_intervals(self, get_queue: MagicMock) -> None:
        queue = MagicMock()
        get_queue.return_value = queue

        add_to_queue(webhook=self.webhook, payload=payload())

        queue.enqueue_call.assert_called_once()
        kwargs = queue.enqueue_call.call_args.kwargs

        assert kwargs["func"] is send_webhook
        assert kwargs["args"] == (self.webhook.id, payload(), False, None)

        retry: Retry = kwargs["retry"]
        assert isinstance(retry, Retry)
        assert retry.max == 3
        assert retry.intervals == [1, 2, 3]

    @override_settings(SEND_WEBHOOK_TASK_RETRIES=[5, 300, 1800])
    @patch("cvat.apps.webhooks.dispatch.django_rq.get_queue")
    def test_redelivery_flag_propagates_to_send_webhook_args(self, get_queue: MagicMock) -> None:
        queue = MagicMock()
        get_queue.return_value = queue

        add_to_queue(webhook=self.webhook, payload=payload(), redelivery=True)

        kwargs = queue.enqueue_call.call_args.kwargs
        assert kwargs["args"] == (self.webhook.id, payload(), True, None)

    @override_settings(SEND_WEBHOOK_TASK_RETRIES=[1])
    @patch("cvat.apps.webhooks.dispatch.django_rq.get_queue")
    def test_presentation_propagates_to_send_webhook_args(self, get_queue: MagicMock) -> None:
        queue = MagicMock()
        get_queue.return_value = queue

        presentation = {"task_progress": {"total": 5, "completed": 2, "validation": 1}}
        add_to_queue(webhook=self.webhook, payload=payload(), presentation=presentation)

        kwargs = queue.enqueue_call.call_args.kwargs
        assert kwargs["args"] == (self.webhook.id, payload(), False, presentation)


class TestBatchAddToQueueWeComSuppression(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        cls.webhook = make_webhook()
        cls.webhook.target_url = WECOM_URL

    @patch("cvat.apps.webhooks.dispatch.add_to_queue")
    def test_metadata_only_wecom_update_is_not_enqueued(self, enqueue: MagicMock) -> None:
        data = {
            "event": "update:job",
            "job": {"id": 1, "task_id": 7, "stage": "annotation", "state": "new"},
            "before_update": {"updated_date": "old date"},
            "sender": {"username": "admin"},
        }

        batch_add_to_queue(webhooks=[self.webhook], data=data)

        enqueue.assert_not_called()

    @patch("cvat.apps.webhooks.dispatch.add_to_queue")
    def test_milestone_wecom_update_is_enqueued(self, enqueue: MagicMock) -> None:
        data = {
            "event": "update:job",
            "job": {"id": 1, "task_id": 7, "stage": "annotation", "state": "completed"},
            "before_update": {"state": "in progress", "updated_date": "old date"},
            "sender": {"username": "admin"},
        }

        batch_add_to_queue(webhooks=[self.webhook], data=data)

        enqueue.assert_called_once()
        assert enqueue.call_args.kwargs["presentation"] is None

    @patch("cvat.apps.webhooks.dispatch.add_to_queue")
    def test_generic_target_is_always_enqueued(self, enqueue: MagicMock) -> None:
        self.webhook.target_url = "http://example.invalid/payload"
        data = {
            "event": "update:job",
            "job": {"id": 1, "task_id": 7},
            "before_update": {"updated_date": "old date"},
            "sender": {"username": "admin"},
        }

        batch_add_to_queue(webhooks=[self.webhook], data=data)

        enqueue.assert_called_once()
        assert enqueue.call_args.kwargs["presentation"] is None
