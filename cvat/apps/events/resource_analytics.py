# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone as datetime_timezone
from typing import Any

import clickhouse_connect
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from cvat.apps.engine import models
from cvat.apps.engine.log import ServerLogManager

slogger = ServerLogManager(__name__)

ACTIVITY_CACHE_TTL = 5 * 60
ACTIVITY_QUERY_TIMEOUT = 15
METRIC_VERSION = "resource-analytics-v1"
OBJECT_KINDS = ("shapes", "tracks", "tags", "intervals")


def resource_filter(resource: models.Project | models.Task | models.Job) -> dict[str, int]:
    if isinstance(resource, models.Project):
        return {"project_id": resource.id}
    if isinstance(resource, models.Task):
        return {"task_id": resource.id}
    if isinstance(resource, models.Job):
        return {"job_id": resource.id}
    raise TypeError(f"Unsupported resource type: {type(resource)!r}")


def _resource_type(resource: models.Project | models.Task | models.Job) -> str:
    return resource.__class__.__name__.lower()


def _ensure_aware(value: datetime) -> datetime:
    if timezone.is_naive(value):
        return value.replace(tzinfo=datetime_timezone.utc)
    return value.astimezone(datetime_timezone.utc)


def _bucket_for_range(start_date: datetime, end_date: datetime, bucket: str) -> str:
    if bucket != "auto":
        return bucket
    duration = end_date - start_date
    if duration <= timedelta(hours=48):
        return "hour"
    if duration <= timedelta(days=90):
        return "day"
    if duration <= timedelta(days=365 * 2):
        return "week"
    return "month"


def _normalize_range(
    start_date: datetime | None, end_date: datetime | None, bucket: str
) -> tuple[datetime, datetime, str]:
    default_end = timezone.now().replace(second=0, microsecond=0)
    end = _ensure_aware(end_date or default_end)
    start = _ensure_aware(start_date or (end - timedelta(days=30)))
    if start > end:
        raise ValueError("start date must be before end date")
    return start, end, _bucket_for_range(start, end, bucket)


def _range_payload(start_date: datetime, end_date: datetime, bucket: str) -> dict[str, Any]:
    return {
        "start_date": start_date,
        "end_date": end_date,
        "bucket": bucket,
        "timezone": "UTC",
    }


def _empty_summary() -> dict[str, Any]:
    return {
        "working_time_ms": 0,
        "created_objects": 0,
        "updated_objects": 0,
        "deleted_objects": 0,
        "net_objects": 0,
        "objects_per_active_hour": None,
        "review_rejections": 0,
        "active_contributors": 0,
    }


def _empty_workflow() -> dict[str, Any]:
    return {
        "transitions": [],
        "dwell_time_by_stage": {},
        "dwell_time_by_state": {},
        "first_activity_at": None,
        "last_activity_at": None,
    }


def _unavailable_payload(
    *,
    start_date: datetime,
    end_date: datetime,
    bucket: str,
    contributor_scope: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    queried_at = timezone.now()
    return {
        "availability": {
            "available": False,
            "reason": reason,
            "queried_at": queried_at,
            "max_event_at": None,
        },
        "range": _range_payload(start_date, end_date, bucket),
        "contributor_scope": contributor_scope,
        "summary": _empty_summary(),
        "series": [],
        "contributors": [],
        "workflow": _empty_workflow(),
    }


def _client():
    clickhouse_settings = settings.CLICKHOUSE["events"]
    return clickhouse_connect.get_client(
        host=clickhouse_settings["HOST"],
        database=clickhouse_settings["NAME"],
        port=clickhouse_settings["PORT"],
        username=clickhouse_settings["USER"],
        password=clickhouse_settings["PASSWORD"],
        tz_mode="schema",
    )


def _conditions(
    resource: models.Project | models.Task | models.Job,
    start_date: datetime,
    end_date: datetime,
    user_id: int | None,
) -> tuple[str, dict[str, Any]]:
    filters = resource_filter(resource)
    column, resource_id = next(iter(filters.items()))
    clauses = [
        "source IN ('server', 'client')",
        "scope != 'send:exception'",
        f"{column} = {{{column}:UInt64}}",
        "timestamp >= {start_date:DateTime64}",
        "timestamp <= {end_date:DateTime64}",
    ]
    parameters: dict[str, Any] = {
        column: resource_id,
        "start_date": start_date,
        "end_date": end_date,
    }
    if user_id is not None:
        clauses.append("user_id = {user_id:UInt64}")
        parameters["user_id"] = user_id
    return " AND ".join(clauses), parameters


def _named_rows(result) -> list[dict[str, Any]]:
    return [dict(zip(result.column_names, row)) for row in result.result_rows]


def _query(client, query: str, parameters: dict[str, Any]):
    return client.query(
        query,
        parameters=parameters,
        settings={"max_execution_time": ACTIVITY_QUERY_TIMEOUT},
    )


def _created_condition(action: str) -> str:
    scopes = ", ".join(f"'{action}:{kind}'" for kind in OBJECT_KINDS)
    return f"scope IN ({scopes})"


def _metrics_select() -> str:
    created = _created_condition("create")
    updated = _created_condition("update")
    deleted = _created_condition("delete")
    rejection = (
        "(scope = 'update:job' AND "
        "((obj_name = 'state' AND obj_val = 'rejected') OR "
        "(obj_name = 'stage' AND obj_val = 'annotation' AND "
        "JSONExtractString(ifNull(payload, '{}'), 'old_value') IN ('validation', 'acceptance'))))"
    )
    return f"""
        toUInt64(sumIf(ifNull(count, 0), {created})) AS created_objects,
        toUInt64(sumIf(ifNull(count, 0), {updated})) AS updated_objects,
        toUInt64(sumIf(ifNull(count, 0), {deleted})) AS deleted_objects,
        toUInt64(sumIf(duration, scope = 'send:working_time')) AS working_time_ms,
        toUInt64(countIf({rejection})) AS review_rejections,
        toUInt64(uniqExactIf(user_id, isNotNull(user_id))) AS active_contributors
    """


def _finalize_metrics(row: dict[str, Any]) -> dict[str, Any]:
    summary = _empty_summary()
    for key in (
        "working_time_ms",
        "created_objects",
        "updated_objects",
        "deleted_objects",
        "review_rejections",
        "active_contributors",
    ):
        summary[key] = int(row.get(key) or 0)
    summary["net_objects"] = summary["created_objects"] - summary["deleted_objects"]
    if summary["working_time_ms"]:
        active_hours = summary["working_time_ms"] / 3_600_000
        summary["objects_per_active_hour"] = round(summary["created_objects"] / active_hours, 2)
    return summary


def _cache_key(
    resource: models.Project | models.Task | models.Job,
    start_date: datetime,
    end_date: datetime,
    bucket: str,
    user_id: int | None,
) -> str:
    raw = "|".join(
        (
            METRIC_VERSION,
            _resource_type(resource),
            str(resource.id),
            start_date.isoformat(),
            end_date.isoformat(),
            bucket,
            str(user_id or "all"),
        )
    )
    return f"resource-analytics:activity:{hashlib.sha256(raw.encode()).hexdigest()}"


def _load_workflow(
    client,
    condition_sql: str,
    parameters: dict[str, Any],
    start_date: datetime,
    end_date: datetime,
) -> dict[str, Any]:
    result = _query(
        client,
        f"""
        SELECT
            job_id,
            obj_name AS field,
            nullIf(JSONExtractString(ifNull(payload, '{{}}'), 'old_value'), '') AS old_value,
            obj_val AS new_value,
            timestamp,
            user_id,
            user_name
        FROM events
        WHERE {condition_sql}
            AND scope = 'update:job'
            AND obj_name IN ('stage', 'state', 'assignee')
        ORDER BY timestamp DESC
        LIMIT 1000
        """,
        parameters,
    )
    transitions = list(reversed(_named_rows(result)))
    dwell_stage: defaultdict[str, int] = defaultdict(int)
    dwell_state: defaultdict[str, int] = defaultdict(int)
    previous: dict[tuple[int | None, str], tuple[datetime, str | None]] = {}

    for transition in transitions:
        key = (transition["job_id"], transition["field"])
        if key not in previous and transition["field"] in ("stage", "state"):
            old_value = transition["old_value"]
            if old_value:
                seconds = max(int((transition["timestamp"] - start_date).total_seconds()), 0)
                target = dwell_stage if transition["field"] == "stage" else dwell_state
                target[old_value] += seconds
        if key in previous:
            previous_time, previous_value = previous[key]
            seconds = max(int((transition["timestamp"] - previous_time).total_seconds()), 0)
            if previous_value and transition["field"] in ("stage", "state"):
                target = dwell_stage if transition["field"] == "stage" else dwell_state
                target[previous_value] += seconds
        previous[key] = (transition["timestamp"], transition["new_value"])

    for (_job_id, field), (previous_time, previous_value) in previous.items():
        seconds = max(int((end_date - previous_time).total_seconds()), 0)
        if previous_value:
            target = dwell_stage if field == "stage" else dwell_state
            if field in ("stage", "state"):
                target[previous_value] += seconds

    normalized = [
        {
            "job_id": row["job_id"],
            "field": row["field"],
            "old_value": row["old_value"],
            "new_value": row["new_value"],
            "timestamp": row["timestamp"],
            "user_id": row["user_id"],
            "user_name": row["user_name"],
        }
        for row in reversed(transitions[-100:])
    ]
    return {
        "transitions": normalized,
        "dwell_time_by_stage": dict(dwell_stage),
        "dwell_time_by_state": dict(dwell_state),
    }


def build_activity(
    resource: models.Project | models.Task | models.Job,
    *,
    start_date: datetime | None,
    end_date: datetime | None,
    bucket: str,
    user_id: int | None,
    contributor_scope: dict[str, Any],
    refresh: bool,
) -> dict[str, Any]:
    start, end, resolved_bucket = _normalize_range(start_date, end_date, bucket)
    key = _cache_key(resource, start, end, resolved_bucket, user_id)
    if not refresh and (cached := cache.get(key)) is not None:
        # The aggregate data is reusable for the same effective user filter,
        # but the authorization mode belongs to the current requester. An
        # administrator filtering to a worker and that worker's self view share
        # data, not UI visibility semantics.
        return {**cached, "contributor_scope": contributor_scope}

    condition_sql, parameters = _conditions(resource, start, end, user_id)
    bucket_function = {
        "hour": "toStartOfHour",
        "day": "toStartOfDay",
        "week": "toStartOfWeek",
        "month": "toStartOfMonth",
    }[resolved_bucket]
    queried_at = timezone.now()

    try:
        with _client() as client:
            summary_result = _query(
                client,
                f"""
                SELECT
                    {_metrics_select()},
                    minOrNull(timestamp) AS first_activity_at,
                    maxOrNull(timestamp) AS last_activity_at
                FROM events
                WHERE {condition_sql}
                """,
                parameters,
            )
            summary_row = _named_rows(summary_result)[0]
            summary = _finalize_metrics(summary_row)

            series_result = _query(
                client,
                f"""
                SELECT
                    {bucket_function}(timestamp) AS bucket_start,
                    {_metrics_select()}
                FROM events
                WHERE {condition_sql}
                GROUP BY bucket_start
                ORDER BY bucket_start ASC
                LIMIT 400
                """,
                parameters,
            )
            series = [
                {"bucket_start": row["bucket_start"], **_finalize_metrics(row)}
                for row in _named_rows(series_result)
            ]

            contributors_result = _query(
                client,
                f"""
                SELECT
                    user_id,
                    argMax(user_name, timestamp) AS user_name,
                    {_metrics_select()},
                    maxOrNull(timestamp) AS last_activity_at
                FROM events
                WHERE {condition_sql} AND isNotNull(user_id)
                GROUP BY user_id
                ORDER BY lowerUTF8(ifNull(user_name, '')), user_id
                LIMIT 200
                """,
                parameters,
            )
            contributors = [
                {
                    "user_id": row["user_id"],
                    "user_name": row["user_name"],
                    "last_activity_at": row["last_activity_at"],
                    **_finalize_metrics(row),
                }
                for row in _named_rows(contributors_result)
            ]
            workflow = _load_workflow(client, condition_sql, parameters, start, end)
            workflow["first_activity_at"] = summary_row.get("first_activity_at")
            workflow["last_activity_at"] = summary_row.get("last_activity_at")

        payload = {
            "availability": {
                "available": True,
                "reason": None,
                "queried_at": queried_at,
                "max_event_at": summary_row.get("last_activity_at"),
            },
            "range": _range_payload(start, end, resolved_bucket),
            "contributor_scope": contributor_scope,
            "summary": summary,
            "series": series,
            "contributors": contributors,
            "workflow": workflow,
        }
        cache.set(key, payload, ACTIVITY_CACHE_TTL)
        return payload
    except Exception:
        slogger.glob.warning(
            "Resource activity analytics is unavailable for %s %s",
            _resource_type(resource),
            resource.id,
            exc_info=True,
        )
        return _unavailable_payload(
            start_date=start,
            end_date=end,
            bucket=resolved_bucket,
            contributor_scope=contributor_scope,
            reason="ClickHouse activity data is unavailable",
        )


def _decode_payload(value: str | None) -> dict[str, Any] | list[Any] | None:
    if not value:
        return None
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return None


def _resource_names(rows: list[dict[str, Any]]):
    project_ids = {row["project_id"] for row in rows if row["project_id"] is not None}
    task_ids = {row["task_id"] for row in rows if row["task_id"] is not None}
    job_ids = {row["job_id"] for row in rows if row["job_id"] is not None}
    projects = dict(models.Project.objects.filter(id__in=project_ids).values_list("id", "name"))
    tasks = dict(models.Task.objects.filter(id__in=task_ids).values_list("id", "name"))
    jobs = {
        row["id"]: {
            "name": f"Job #{row['id']}",
            "type": row["type"],
            "assignee": row["assignee__username"],
            "stage": row["stage"],
            "state": row["state"],
        }
        for row in models.Job.objects.filter(id__in=job_ids).values(
            "id",
            "type",
            "assignee__username",
            "stage",
            "state",
        )
    }
    return projects, tasks, jobs


def _payload_assignee(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("username")
    return value if isinstance(value, str) else None


def build_events_page(
    resource: models.Project | models.Task | models.Job,
    *,
    start_date: datetime | None,
    end_date: datetime | None,
    bucket: str,
    user_id: int | None,
    contributor_scope: dict[str, Any],
    page: int,
    page_size: int,
) -> dict[str, Any]:
    start, end, resolved_bucket = _normalize_range(start_date, end_date, bucket)
    condition_sql, parameters = _conditions(resource, start, end, user_id)
    queried_at = timezone.now()
    offset = (page - 1) * page_size

    try:
        with _client() as client:
            count_result = _query(
                client,
                f"SELECT count() AS count, maxOrNull(timestamp) AS max_event_at FROM events WHERE {condition_sql}",
                parameters,
            )
            count_row = _named_rows(count_result)[0]
            result = _query(
                client,
                f"""
                SELECT
                    scope, obj_name, obj_id, obj_val, timestamp, count, duration,
                    project_id, task_id, job_id, user_id, user_name, payload
                FROM events
                WHERE {condition_sql}
                ORDER BY timestamp DESC
                LIMIT {page_size} OFFSET {offset}
                """,
                parameters,
            )
            rows = _named_rows(result)

        projects, tasks, jobs = _resource_names(rows)
        normalized = []
        for row in rows:
            payload = _decode_payload(row["payload"])
            job_details = jobs.get(row["job_id"]) if row["job_id"] is not None else None
            if row["job_id"] is not None:
                exists = job_details is not None
                name = job_details["name"] if job_details else f"Job #{row['job_id']}"
            elif row["task_id"] is not None:
                exists = row["task_id"] in tasks
                name = tasks.get(row["task_id"], f"Task #{row['task_id']}")
            else:
                exists = row["project_id"] in projects
                name = projects.get(row["project_id"], f"Project #{row['project_id']}")

            if not exists and row["scope"] in ("delete:job", "delete:task", "delete:project"):
                name = row["obj_name"] or name

            duration = int(row["duration"] or 0)
            count = int(row["count"] or 0)
            scope = row["scope"]
            is_logical_object_scope = scope.partition(":")[2] in OBJECT_KINDS
            job_payload = payload if isinstance(payload, dict) else {}

            normalized.append(
                {
                    **row,
                    "count": row["count"],
                    "duration": duration,
                    "end_timestamp": row["timestamp"] + timedelta(milliseconds=duration),
                    "working_time_ms": duration if scope == "send:working_time" else 0,
                    "created_objects": count
                    if is_logical_object_scope and scope.startswith("create:")
                    else 0,
                    "updated_objects": count
                    if is_logical_object_scope and scope.startswith("update:")
                    else 0,
                    "deleted_objects": count
                    if is_logical_object_scope and scope.startswith("delete:")
                    else 0,
                    "job_type": (job_details or {}).get("type") or job_payload.get("type"),
                    "assignee": (job_details or {}).get("assignee")
                    or _payload_assignee(job_payload.get("assignee")),
                    "stage": (job_details or {}).get("stage") or job_payload.get("stage"),
                    "state": (job_details or {}).get("state") or job_payload.get("state"),
                    "payload": payload,
                    "resource_exists": exists,
                    "resource_name": name,
                }
            )

        return {
            "availability": {
                "available": True,
                "reason": None,
                "queried_at": queried_at,
                "max_event_at": count_row.get("max_event_at"),
            },
            "range": _range_payload(start, end, resolved_bucket),
            "contributor_scope": contributor_scope,
            "count": int(count_row.get("count") or 0),
            "page": page,
            "page_size": page_size,
            "results": normalized,
        }
    except Exception:
        slogger.glob.warning(
            "Resource event analytics is unavailable for %s %s",
            _resource_type(resource),
            resource.id,
            exc_info=True,
        )
        unavailable = _unavailable_payload(
            start_date=start,
            end_date=end,
            bucket=resolved_bucket,
            contributor_scope=contributor_scope,
            reason="ClickHouse event data is unavailable",
        )
        return {
            "availability": unavailable["availability"],
            "range": unavailable["range"],
            "contributor_scope": contributor_scope,
            "count": 0,
            "page": page,
            "page_size": page_size,
            "results": [],
        }
