# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase, mock

from django.http import QueryDict

from cvat.apps.engine import models
from cvat.apps.engine.background import BaseResourceExporter
from cvat.apps.events import resource_analytics
from cvat.apps.events.export import EventsExporter


class _QueryResult:
    def __init__(self, column_names, rows):
        self.column_names = column_names
        self.result_rows = rows


class _WorkflowClient:
    def __init__(self, rows):
        self.rows = rows

    def query(self, *_args, **_kwargs):
        return _QueryResult(
            ("job_id", "field", "old_value", "new_value", "timestamp", "user_id", "user_name"),
            list(reversed(self.rows)),
        )


class ResourceActivityMetricsTest(TestCase):
    def test_auto_bucket_selection(self):
        end = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(
            resource_analytics._normalize_range(end - timedelta(hours=24), end, "auto")[2],
            "hour",
        )
        self.assertEqual(
            resource_analytics._normalize_range(end - timedelta(days=30), end, "auto")[2],
            "day",
        )
        self.assertEqual(
            resource_analytics._normalize_range(end - timedelta(days=365), end, "auto")[2],
            "week",
        )
        self.assertEqual(
            resource_analytics._normalize_range(end - timedelta(days=800), end, "auto")[2],
            "month",
        )

    def test_speed_uses_gross_created_objects_and_zero_time_returns_none(self):
        summary = resource_analytics._finalize_metrics(
            {
                "working_time_ms": 3_600_000,
                "created_objects": 12,
                "updated_objects": 7,
                "deleted_objects": 5,
                "review_rejections": 2,
                "active_contributors": 3,
            }
        )
        self.assertEqual(summary["objects_per_active_hour"], 12)
        self.assertEqual(summary["net_objects"], 7)

        summary = resource_analytics._finalize_metrics({"created_objects": 12})
        self.assertIsNone(summary["objects_per_active_hour"])

    def test_assignee_transitions_do_not_pollute_state_dwell_time(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        client = _WorkflowClient(
            [
                (1, "stage", None, "annotation", start, 1, "worker"),
                (1, "assignee", None, "worker", start + timedelta(seconds=5), 2, "manager"),
                (
                    1,
                    "stage",
                    "annotation",
                    "validation",
                    start + timedelta(seconds=10),
                    2,
                    "manager",
                ),
            ]
        )

        workflow = resource_analytics._load_workflow(
            client,
            "project_id = 1",
            {},
            start,
            start + timedelta(seconds=30),
        )

        self.assertEqual(workflow["dwell_time_by_stage"], {"annotation": 10, "validation": 20})
        self.assertEqual(workflow["dwell_time_by_state"], {})

    @mock.patch.object(resource_analytics, "_client", side_effect=RuntimeError("offline"))
    def test_clickhouse_failure_returns_structured_unavailability(self, _mock_client):
        end = datetime(2026, 1, 2, tzinfo=timezone.utc)
        payload = resource_analytics.build_activity(
            models.Project(id=7),
            start_date=end - timedelta(days=1),
            end_date=end,
            bucket="auto",
            user_id=None,
            contributor_scope={"mode": "all", "user_id": None},
            refresh=True,
        )

        self.assertFalse(payload["availability"]["available"])
        self.assertEqual(payload["summary"]["created_objects"], 0)
        self.assertEqual(payload["series"], [])

    def test_cache_key_isolated_by_effective_user_filter(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        resource = models.Task(id=11)
        all_key = resource_analytics._cache_key(resource, start, end, "day", None)
        self_key = resource_analytics._cache_key(resource, start, end, "day", 4)

        self.assertNotEqual(all_key, self_key)

    def test_cached_activity_uses_current_requester_scope_mode(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        cached = {
            "contributor_scope": {"mode": "filtered", "user_id": 4},
            "summary": {"created_objects": 2},
        }

        with mock.patch.object(resource_analytics.cache, "get", return_value=cached):
            payload = resource_analytics.build_activity(
                models.Task(id=11),
                start_date=start,
                end_date=end,
                bucket="day",
                user_id=4,
                contributor_scope={"mode": "self", "user_id": 4},
                refresh=False,
            )

        self.assertEqual(payload["contributor_scope"], {"mode": "self", "user_id": 4})
        self.assertEqual(cached["contributor_scope"], {"mode": "filtered", "user_id": 4})

    def test_resource_export_filter_cannot_be_widened_by_query_parameters(self):
        request = SimpleNamespace(
            user=SimpleNamespace(id=4),
            method="POST",
            query_params=QueryDict(
                "project_id=999&task_id=888&user_id=777&from=2026-01-01T00:00:00Z"
            ),
        )
        exporter = EventsExporter(
            request=request,
            filter_override={"project_id": 7, "user_id": 4},
        )

        with mock.patch.object(BaseResourceExporter, "init_request_args"):
            exporter.init_request_args()

        self.assertEqual(exporter.filter_query["project_id"], 7)
        self.assertEqual(exporter.filter_query["user_id"], 4)
        self.assertNotIn("task_id", exporter.filter_query)
        self.assertEqual(exporter.filter_query["from"], "2026-01-01T00:00:00Z")
