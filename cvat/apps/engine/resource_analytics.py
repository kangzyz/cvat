# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from cvat.apps.dataset_manager.tracks_counter import TracksCounter
from cvat.apps.engine import models
from cvat.apps.engine.resource_analytics_serializers import (
    ResourceAnalyticsActivitySerializer,
    ResourceAnalyticsAnnotationsSerializer,
    ResourceAnalyticsEventsSerializer,
    ResourceAnalyticsOverviewSerializer,
    ResourceAnalyticsQuerySerializer,
)
from cvat.apps.events import resource_analytics as event_analytics
from cvat.apps.events.export import EventsExporter
from cvat.apps.organizations.models import Membership
from cvat.apps.quality_control.models import AnnotationConflict, QualityReport
from cvat.apps.quality_control.serializers import QualityReportSerializer
from cvat.apps.redis_handler.serializers import RqIdSerializer

MAX_CHILD_ROWS = 100
MAX_DENSITY_ROWS = 48


Resource = models.Project | models.Task | models.Job


def _resource_type(resource: Resource) -> str:
    if isinstance(resource, models.Project):
        return "project"
    if isinstance(resource, models.Task):
        return "task"
    if isinstance(resource, models.Job):
        return "job"
    raise TypeError(f"Unsupported resource type: {type(resource)!r}")


def _resource_task(resource: Resource) -> models.Task | None:
    if isinstance(resource, models.Task):
        return resource
    if isinstance(resource, models.Job):
        return resource.segment.task
    return None


def _resource_project(resource: Resource) -> models.Project | None:
    if isinstance(resource, models.Project):
        return resource
    if task := _resource_task(resource):
        return task.project
    return None


def _resource_name(resource: Resource) -> str:
    if isinstance(resource, models.Job):
        return f"Job #{resource.id}"
    return resource.name


def _resource_descriptor(resource: Resource) -> dict[str, Any]:
    task = _resource_task(resource)
    project = _resource_project(resource)
    owner = getattr(resource, "owner", None)
    assignee = getattr(resource, "assignee", None)

    if isinstance(resource, models.Job):
        owner = task.owner

    return {
        "type": _resource_type(resource),
        "id": resource.id,
        "name": _resource_name(resource),
        "project_id": project.id if project else None,
        "task_id": task.id if task else None,
        "owner": owner.username if owner else None,
        "assignee": assignee.username if assignee else None,
        "organization_id": getattr(resource, "organization_id", None),
        "created_date": resource.created_date,
        "updated_date": resource.updated_date,
    }


def _all_jobs(resource: Resource):
    queryset = models.Job.objects.select_related("assignee", "segment", "segment__task")
    if isinstance(resource, models.Project):
        return queryset.filter(segment__task__project_id=resource.id)
    if isinstance(resource, models.Task):
        return queryset.filter(segment__task_id=resource.id)
    return queryset.filter(id=resource.id)


def _analytics_jobs(resource: Resource):
    queryset = _all_jobs(resource)
    if isinstance(resource, models.Job):
        return queryset
    return queryset.filter(type=models.JobType.ANNOTATION.value)


def _frame_count(resource: Resource) -> int:
    if isinstance(resource, models.Project):
        return resource.tasks.aggregate(total=Sum("data__size"))["total"] or 0
    if isinstance(resource, models.Task):
        return resource.data.size if resource.data_id else 0
    return resource.segment.frame_count


def _empty_inventory(frames: int = 0) -> dict[str, int]:
    return {
        "frames": frames,
        "logical_objects": 0,
        "shapes": 0,
        "tracks": 0,
        "tags": 0,
        "intervals": 0,
        "keyframes": 0,
        "interpolated_frames": 0,
    }


def _annotation_snapshot(
    job_ids: list[int], *, frames: int = 0, distributions: bool = False
) -> tuple[dict[str, int], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    inventory = _empty_inventory(frames)
    if not job_ids:
        return inventory, [], [], []

    label_rows: defaultdict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "label_id": 0,
            "label": "",
            "shapes": 0,
            "tracks": 0,
            "tags": 0,
            "intervals": 0,
            "keyframes": 0,
            "interpolated_frames": 0,
            "total": 0,
        }
    )
    source_counts: defaultdict[str, int] = defaultdict(int)
    type_counts: defaultdict[str, int] = defaultdict(int)

    annotation_models = (
        (models.LabeledShape, "shapes", {"parent__isnull": True}),
        (models.LabeledTrack, "tracks", {"parent__isnull": True}),
        (models.LabeledImage, "tags", {}),
        (models.LabeledInterval, "intervals", {}),
    )

    for model, field, extra_filters in annotation_models:
        queryset = model.objects.filter(job_id__in=job_ids, **extra_filters)
        count = queryset.count()
        inventory[field] = count
        inventory["logical_objects"] += count

        if not distributions:
            continue

        for row in queryset.values("label_id", "label__name").annotate(count=Count("id")):
            label_id = row["label_id"]
            target = label_rows[label_id]
            target["label_id"] = label_id
            target["label"] = row["label__name"] or "(unlabeled)"
            target[field] += row["count"]
            target["total"] += row["count"]

        for row in queryset.values("source").annotate(count=Count("id")):
            source_counts[row["source"] or "unknown"] += row["count"]

    if distributions:
        for row in (
            models.LabeledShape.objects.filter(job_id__in=job_ids, parent__isnull=True)
            .values("type")
            .annotate(count=Count("id"))
        ):
            type_counts[f"shape:{row['type']}"] += row["count"]
        type_counts["track"] += inventory["tracks"]
        type_counts["tag"] += inventory["tags"]
        type_counts["interval"] += inventory["intervals"]

    counter = TracksCounter()
    counter.load_tracks_from_db(
        parent_labeledtrack_qs_filter=lambda queryset: queryset.filter(job_id__in=job_ids),
        child_labeledtrack_qs_filter=lambda queryset: queryset.filter(job_id__in=job_ids),
    )
    for job_id, track_id, label_id, label_name in models.LabeledTrack.objects.filter(
        job_id__in=job_ids, parent__isnull=True
    ).values_list("job_id", "id", "label_id", "label__name"):
        counts = counter.count_track_shapes(job_id, track_id)
        inventory["keyframes"] += counts["manual"]
        inventory["interpolated_frames"] += counts["interpolated"]
        if distributions:
            target = label_rows[label_id]
            target["label_id"] = label_id
            target["label"] = label_name or "(unlabeled)"
            target["keyframes"] += counts["manual"]
            target["interpolated_frames"] += counts["interpolated"]

    by_label = sorted(label_rows.values(), key=lambda row: (-row["total"], row["label"]))
    by_type = sorted(
        ({"name": name, "count": count} for name, count in type_counts.items()),
        key=lambda row: (-row["count"], row["name"]),
    )
    by_source = sorted(
        ({"name": name, "count": count} for name, count in source_counts.items()),
        key=lambda row: (-row["count"], row["name"]),
    )
    return inventory, by_label, by_type, by_source


def _issue_summary(job_ids: list[int]) -> dict[str, int]:
    if not job_ids:
        return {"total": 0, "open": 0, "resolved": 0}
    values = models.Issue.objects.filter(job_id__in=job_ids).aggregate(
        total=Count("id"),
        open=Count("id", filter=Q(resolved=False)),
        resolved=Count("id", filter=Q(resolved=True)),
    )
    return {key: values[key] or 0 for key in ("total", "open", "resolved")}


def _latest_quality_report(resource: Resource) -> QualityReport | None:
    filters: dict[str, int]
    if isinstance(resource, models.Project):
        filters = {"project_id": resource.id}
    elif isinstance(resource, models.Task):
        filters = {"task_id": resource.id}
    else:
        filters = {"job_id": resource.id}
    return QualityReport.objects.filter(**filters).order_by("-created_date", "-id").first()


def _quality_summary(resource: Resource) -> tuple[dict[str, Any], QualityReport | None]:
    report = _latest_quality_report(resource)
    if report is None:
        return {
            "available": False,
            "report_id": None,
            "accuracy": None,
            "precision": None,
            "recall": None,
            "conflicts": 0,
            "errors": 0,
            "warnings": 0,
            "validation_frames": 0,
            "total_frames": 0,
            "validation_frame_share": None,
            "created_date": None,
            "target_last_updated": None,
            "stale": False,
        }, None

    serialized = QualityReportSerializer(report).data
    summary = serialized.get("summary", {})
    stale = bool(report.target_last_updated < resource.updated_date)
    return {
        "available": True,
        "report_id": report.id,
        "accuracy": summary.get("accuracy"),
        "precision": summary.get("precision"),
        "recall": summary.get("recall"),
        "conflicts": summary.get("conflict_count", 0),
        "errors": summary.get("error_count", 0),
        "warnings": summary.get("warning_count", 0),
        "validation_frames": summary.get("validation_frames", 0),
        "total_frames": summary.get("total_frames", 0),
        "validation_frame_share": summary.get("validation_frame_share"),
        "created_date": report.created_date,
        "target_last_updated": report.target_last_updated,
        "stale": stale,
    }, report


def _job_progress(jobs) -> dict[str, Any]:
    total = jobs.count()
    completed = jobs.filter(
        stage=models.StageChoice.ACCEPTANCE.value,
        state=models.StateChoice.COMPLETED.value,
    ).count()
    by_stage = {
        row["stage"]: row["count"]
        for row in jobs.values("stage").annotate(count=Count("id"))
    }
    by_state = {
        row["state"]: row["count"]
        for row in jobs.values("state").annotate(count=Count("id"))
    }
    return {
        "total": total,
        "completed": completed,
        "percent": round(completed / total * 100, 1) if total else 0,
        "by_stage": by_stage,
        "by_state": by_state,
    }


def _progress(resource: Resource) -> dict[str, Any]:
    jobs = _all_jobs(resource)
    ground_truth = jobs.filter(type=models.JobType.GROUND_TRUTH.value).count()
    consensus = jobs.filter(type=models.JobType.CONSENSUS_REPLICA.value).count()
    if isinstance(resource, models.Job):
        return {
            "mode": "workflow",
            "annotation_jobs": None,
            "ground_truth_jobs": ground_truth,
            "consensus_jobs": consensus,
            "job": {"type": resource.type, "stage": resource.stage, "state": resource.state},
        }

    return {
        "mode": "jobs",
        "annotation_jobs": _job_progress(
            jobs.filter(type=models.JobType.ANNOTATION.value)
        ),
        "ground_truth_jobs": ground_truth,
        "consensus_jobs": consensus,
        "job": None,
    }


def _logical_counts_by(job_ids: list[int], group_field: str) -> dict[int, int]:
    totals: defaultdict[int, int] = defaultdict(int)
    if not job_ids:
        return totals
    for model, extra_filters in (
        (models.LabeledShape, {"parent__isnull": True}),
        (models.LabeledTrack, {"parent__isnull": True}),
        (models.LabeledImage, {}),
        (models.LabeledInterval, {}),
    ):
        rows = (
            model.objects.filter(job_id__in=job_ids, **extra_filters)
            .values(group_field)
            .annotate(count=Count("id"))
        )
        for row in rows:
            totals[row[group_field]] += row["count"]
    return totals


def _quality_metrics_map(target: str, ids: list[int]) -> dict[int, dict[str, Any]]:
    if not ids:
        return {}
    field = f"{target}_id"
    reports = (
        QualityReport.objects.filter(**{f"{field}__in": ids})
        .order_by(field, "-created_date", "-id")
        .distinct(field)
    )
    result: dict[int, dict[str, Any]] = {}
    for report in reports:
        serialized = QualityReportSerializer(report).data
        summary = serialized.get("summary", {})
        result[getattr(report, field)] = {
            "accuracy": summary.get("accuracy"),
            "conflicts": summary.get("conflict_count", 0),
        }
    return result


def _project_children(project: models.Project) -> tuple[int, list[dict[str, Any]]]:
    tasks = list(
        models.Task.objects.filter(project_id=project.id)
        .select_related("assignee", "data")
        .order_by("id")[:MAX_CHILD_ROWS]
    )
    task_ids = [task.id for task in tasks]
    children_count = models.Task.objects.filter(project_id=project.id).count()
    ordinary_jobs = models.Job.objects.filter(
        segment__task_id__in=task_ids,
        type=models.JobType.ANNOTATION.value,
    )
    job_ids = list(ordinary_jobs.values_list("id", flat=True))
    progress = {
        row["segment__task_id"]: row
        for row in ordinary_jobs.values("segment__task_id").annotate(
            total=Count("id"),
            completed=Count(
                "id",
                filter=Q(stage=models.StageChoice.ACCEPTANCE.value)
                & Q(state=models.StateChoice.COMPLETED.value),
            ),
        )
    }
    logical = _logical_counts_by(job_ids, "job__segment__task_id")
    open_issues = {
        row["job__segment__task_id"]: row["count"]
        for row in models.Issue.objects.filter(job_id__in=job_ids, resolved=False)
        .values("job__segment__task_id")
        .annotate(count=Count("id"))
    }
    quality = _quality_metrics_map("task", task_ids)

    rows = []
    for task in tasks:
        task_progress = progress.get(task.id, {"total": 0, "completed": 0})
        rows.append(
            {
                "resource_type": "task",
                "id": task.id,
                "name": task.name,
                "project_id": project.id,
                "task_id": task.id,
                "job_id": None,
                "job_type": None,
                "stage": None,
                "state": None,
                "assignee": task.assignee.username if task.assignee_id else None,
                "frames": task.data.size if task.data_id else 0,
                "annotation_jobs_total": task_progress["total"],
                "annotation_jobs_completed": task_progress["completed"],
                "completion_percent": (
                    round(task_progress["completed"] / task_progress["total"] * 100, 1)
                    if task_progress["total"]
                    else 0
                ),
                "logical_objects": logical.get(task.id, 0),
                "open_issues": open_issues.get(task.id, 0),
                "quality_accuracy": quality.get(task.id, {}).get("accuracy"),
                "issue_count": open_issues.get(task.id, 0),
                "conflict_count": quality.get(task.id, {}).get("conflicts", 0),
                "updated_date": task.updated_date,
            }
        )
    return children_count, rows


def _task_children(task: models.Task) -> tuple[int, list[dict[str, Any]]]:
    queryset = models.Job.objects.filter(segment__task_id=task.id).select_related(
        "assignee", "segment"
    )
    children_count = queryset.count()
    jobs = list(queryset.order_by("segment__start_frame", "id")[:MAX_CHILD_ROWS])
    job_ids = [job.id for job in jobs]
    # The parent Task inventory intentionally excludes special Jobs, but every
    # child row describes that exact Job and must report its own inventory.
    logical = _logical_counts_by(job_ids, "job_id")
    open_issues = {
        row["job_id"]: row["count"]
        for row in models.Issue.objects.filter(job_id__in=job_ids, resolved=False)
        .values("job_id")
        .annotate(count=Count("id"))
    }
    quality = _quality_metrics_map("job", job_ids)
    project_id = task.project_id

    rows = []
    for job in jobs:
        rows.append(
            {
                "resource_type": "job",
                "id": job.id,
                "name": f"Job #{job.id}",
                "project_id": project_id,
                "task_id": task.id,
                "job_id": job.id,
                "job_type": job.type,
                "stage": job.stage,
                "state": job.state,
                "assignee": job.assignee.username if job.assignee_id else None,
                "frames": job.segment.frame_count,
                "annotation_jobs_total": 1 if job.type == models.JobType.ANNOTATION.value else 0,
                "annotation_jobs_completed": int(
                    job.type == models.JobType.ANNOTATION.value
                    and job.stage == models.StageChoice.ACCEPTANCE.value
                    and job.state == models.StateChoice.COMPLETED.value
                ),
                "completion_percent": None,
                "logical_objects": logical.get(job.id, 0),
                "open_issues": open_issues.get(job.id, 0),
                "quality_accuracy": quality.get(job.id, {}).get("accuracy"),
                "issue_count": open_issues.get(job.id, 0),
                "conflict_count": quality.get(job.id, {}).get("conflicts", 0),
                "updated_date": job.updated_date,
            }
        )
    return children_count, rows


def _job_children(job: models.Job, report: QualityReport | None) -> tuple[int, list[dict[str, Any]]]:
    issues = {
        row["frame"]: {"issue_count": row["count"], "open_issues": row["open"]}
        for row in models.Issue.objects.filter(job_id=job.id)
        .values("frame")
        .annotate(count=Count("id"), open=Count("id", filter=Q(resolved=False)))
    }
    conflicts: dict[int, int] = {}
    if report:
        conflicts = {
            row["frame"]: row["count"]
            for row in AnnotationConflict.objects.filter(report_id=report.id)
            .values("frame")
            .annotate(count=Count("id"))
        }

    frames = sorted(
        set(issues) | set(conflicts),
        key=lambda frame: (
            -(issues.get(frame, {}).get("open_issues", 0) + conflicts.get(frame, 0)),
            frame,
        ),
    )
    rows = [
        {
            "resource_type": "frame",
            "id": frame,
            "name": f"Frame {frame}",
            "project_id": job.segment.task.project_id,
            "task_id": job.segment.task_id,
            "job_id": job.id,
            "job_type": job.type,
            "stage": job.stage,
            "state": job.state,
            "assignee": job.assignee.username if job.assignee_id else None,
            "frames": 1,
            "annotation_jobs_total": 0,
            "annotation_jobs_completed": 0,
            "completion_percent": None,
            "logical_objects": 0,
            "open_issues": issues.get(frame, {}).get("open_issues", 0),
            "quality_accuracy": None,
            "issue_count": issues.get(frame, {}).get("issue_count", 0),
            "conflict_count": conflicts.get(frame, 0),
            "updated_date": None,
        }
        for frame in frames[:MAX_CHILD_ROWS]
    ]
    return len(frames), rows


def _frame_density(resource: Resource, job_ids: list[int], report: QualityReport | None):
    if not job_ids:
        return []

    if not isinstance(resource, models.Job):
        jobs = list(
            models.Job.objects.filter(id__in=job_ids)
            .select_related("segment")
            .order_by("segment__start_frame", "id")[:MAX_DENSITY_ROWS]
        )
        selected_job_ids = [job.id for job in jobs]
        logical = _logical_counts_by(selected_job_ids, "job_id")
        issues = {
            row["job_id"]: row["count"]
            for row in models.Issue.objects.filter(job_id__in=selected_job_ids, resolved=False)
            .values("job_id")
            .annotate(count=Count("id"))
        }
        quality = _quality_metrics_map("job", selected_job_ids)
        return [
            {
                "job_id": job.id,
                "task_id": job.segment.task_id,
                "start_frame": job.segment.start_frame,
                "stop_frame": job.segment.stop_frame,
                "object_count": logical.get(job.id, 0),
                "issue_count": issues.get(job.id, 0),
                "conflict_count": quality.get(job.id, {}).get("conflicts", 0),
            }
            for job in jobs
        ]

    start = resource.segment.start_frame
    stop = resource.segment.stop_frame
    frame_count = max(stop - start + 1, 1)
    bucket_count = min(MAX_DENSITY_ROWS, frame_count)
    bucket_size = max(math.ceil(frame_count / bucket_count), 1)
    rows = [
        {
            "job_id": resource.id,
            "task_id": resource.segment.task_id,
            "start_frame": start + index * bucket_size,
            "stop_frame": min(stop, start + (index + 1) * bucket_size - 1),
            "object_count": 0,
            "issue_count": 0,
            "conflict_count": 0,
        }
        for index in range(bucket_count)
    ]

    def bucket_index(frame: int) -> int | None:
        if frame < start or frame > stop:
            return None
        return min((frame - start) // bucket_size, bucket_count - 1)

    frame_sources = (
        models.LabeledShape.objects.filter(job_id=resource.id, parent__isnull=True),
        models.LabeledImage.objects.filter(job_id=resource.id),
        models.LabeledTrack.objects.filter(job_id=resource.id, parent__isnull=True),
    )
    for queryset in frame_sources:
        for item in queryset.values("frame").annotate(count=Count("id")):
            if (index := bucket_index(item["frame"])) is not None:
                rows[index]["object_count"] += item["count"]
    for item in models.LabeledInterval.objects.filter(job_id=resource.id).values("start").annotate(
        count=Count("id")
    ):
        if (index := bucket_index(item["start"])) is not None:
            rows[index]["object_count"] += item["count"]
    for item in models.Issue.objects.filter(job_id=resource.id, resolved=False).values(
        "frame"
    ).annotate(count=Count("id")):
        if (index := bucket_index(item["frame"])) is not None:
            rows[index]["issue_count"] += item["count"]
    if report:
        for item in AnnotationConflict.objects.filter(report_id=report.id).values("frame").annotate(
            count=Count("id")
        ):
            if (index := bucket_index(item["frame"])) is not None:
                rows[index]["conflict_count"] += item["count"]
    return rows


def build_overview(resource: Resource) -> dict[str, Any]:
    now = timezone.now()
    jobs = _analytics_jobs(resource)
    job_ids = list(jobs.values_list("id", flat=True))
    inventory, _, _, _ = _annotation_snapshot(job_ids, frames=_frame_count(resource))
    issues = _issue_summary(job_ids)
    quality, report = _quality_summary(resource)
    tracked_jobs = _analytics_jobs(resource)
    backlog = {
        row["stage"]: row["count"]
        for row in tracked_jobs.exclude(
            stage=models.StageChoice.ACCEPTANCE.value,
            state=models.StateChoice.COMPLETED.value,
        )
        .values("stage")
        .annotate(count=Count("id"))
    }
    risks = {
        "unassigned_jobs": tracked_jobs.filter(assignee__isnull=True).count(),
        "inactive_age_seconds": max(int((now - resource.updated_date).total_seconds()), 0),
        "stage_backlog": backlog,
        "open_issues": issues["open"],
        "rejected_jobs": tracked_jobs.filter(state=models.StateChoice.REJECTED.value).count(),
        "quality_accuracy": quality["accuracy"],
    }

    if isinstance(resource, models.Project):
        children_count, children = _project_children(resource)
    elif isinstance(resource, models.Task):
        children_count, children = _task_children(resource)
    else:
        children_count, children = _job_children(resource, report)

    return {
        "resource": _resource_descriptor(resource),
        "freshness": {
            "snapshot_at": now,
            "quality_at": quality["created_date"],
            "quality_stale": quality["stale"],
            "activity_configured": bool(getattr(settings, "CLICKHOUSE", {}).get("events")),
        },
        "progress": _progress(resource),
        "inventory": inventory,
        "issues": issues,
        "quality": quality,
        "risks": risks,
        "children_count": children_count,
        "children": children,
    }


def build_annotations(resource: Resource) -> dict[str, Any]:
    jobs = _analytics_jobs(resource)
    job_ids = list(jobs.values_list("id", flat=True))
    quality_report = _latest_quality_report(resource)
    inventory, by_label, by_type, by_source = _annotation_snapshot(
        job_ids,
        frames=_frame_count(resource),
        distributions=True,
    )
    return {
        "snapshot_at": timezone.now(),
        "totals": inventory,
        "by_label": by_label,
        "by_type": by_type,
        "by_source": by_source,
        "frame_density": _frame_density(resource, job_ids, quality_report),
    }


def _resource_owner_ids(resource: Resource) -> set[int]:
    owner_ids: set[int] = set()
    if isinstance(resource, models.Project):
        if resource.owner_id:
            owner_ids.add(resource.owner_id)
        return owner_ids

    task = _resource_task(resource)
    if task and task.owner_id:
        owner_ids.add(task.owner_id)
    if task and task.project_id and task.project.owner_id:
        owner_ids.add(task.project.owner_id)
    return owner_ids


def contributor_user_filter(
    request, resource: Resource, requested_user_id: int | None
) -> tuple[int | None, dict[str, Any]]:
    if request.user.is_superuser or request.user.is_staff:
        forced_user_id = None
    elif getattr(resource, "organization_id", None):
        membership = Membership.objects.filter(
            organization_id=resource.organization_id,
            user_id=request.user.id,
            is_active=True,
        ).only("role").first()
        full_roles = {Membership.OWNER, Membership.MAINTAINER, Membership.SUPERVISOR}
        forced_user_id = None if membership and membership.role in full_roles else request.user.id
    else:
        forced_user_id = None if request.user.id in _resource_owner_ids(resource) else request.user.id

    if forced_user_id is not None:
        if requested_user_id is not None and requested_user_id != forced_user_id:
            raise PermissionDenied("Contributor analytics is limited to the current user")
        return forced_user_id, {"mode": "self", "user_id": forced_user_id}

    if requested_user_id is not None:
        return requested_user_id, {"mode": "filtered", "user_id": requested_user_id}
    return None, {"mode": "all", "user_id": None}


def _validated_response(serializer_class, data: dict[str, Any]) -> Response:
    serializer = serializer_class(data=data)
    serializer.is_valid(raise_exception=True)
    return Response(serializer.data)


ANALYTICS_TIME_PARAMETERS = [
    OpenApiParameter("from", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, required=False),
    OpenApiParameter("to", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, required=False),
    OpenApiParameter(
        "bucket",
        OpenApiTypes.STR,
        OpenApiParameter.QUERY,
        required=False,
        enum=["auto", "hour", "day", "week", "month"],
        default="auto",
    ),
    OpenApiParameter("user_id", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
]


class ResourceAnalyticsMixin:
    def _resource_for_analytics(self) -> Resource:
        return self.get_object()

    def _analytics_query(self, request) -> dict[str, Any]:
        serializer = ResourceAnalyticsQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    @extend_schema(
        summary="Get resource analytics overview",
        responses={"200": ResourceAnalyticsOverviewSerializer},
    )
    @action(detail=True, methods=["GET"], url_path="analytics/overview")
    def analytics_overview(self, request, pk=None):
        resource = self._resource_for_analytics()
        return _validated_response(ResourceAnalyticsOverviewSerializer, build_overview(resource))

    @extend_schema(
        summary="Get resource annotation analytics",
        responses={"200": ResourceAnalyticsAnnotationsSerializer},
    )
    @action(detail=True, methods=["GET"], url_path="analytics/annotations")
    def analytics_annotations(self, request, pk=None):
        resource = self._resource_for_analytics()
        return _validated_response(
            ResourceAnalyticsAnnotationsSerializer,
            build_annotations(resource),
        )

    @extend_schema(
        summary="Get resource activity analytics",
        parameters=[
            *ANALYTICS_TIME_PARAMETERS,
            OpenApiParameter(
                "refresh", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False, default=False
            ),
        ],
        responses={"200": ResourceAnalyticsActivitySerializer},
    )
    @action(detail=True, methods=["GET"], url_path="analytics/activity")
    def analytics_activity(self, request, pk=None):
        resource = self._resource_for_analytics()
        query = self._analytics_query(request)
        user_filter, contributor_scope = contributor_user_filter(
            request, resource, query.get("user_id")
        )
        data = event_analytics.build_activity(
            resource,
            start_date=query.get("start_date"),
            end_date=query.get("end_date"),
            bucket=query["bucket"],
            user_id=user_filter,
            contributor_scope=contributor_scope,
            refresh=query["refresh"],
        )
        return _validated_response(ResourceAnalyticsActivitySerializer, data)

    @extend_schema(
        summary="List resource analytics events",
        parameters=[
            *ANALYTICS_TIME_PARAMETERS,
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("page_size", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
        ],
        responses={"200": ResourceAnalyticsEventsSerializer},
    )
    @action(detail=True, methods=["GET"], url_path="analytics/events")
    def analytics_events(self, request, pk=None):
        resource = self._resource_for_analytics()
        query = self._analytics_query(request)
        user_filter, contributor_scope = contributor_user_filter(
            request, resource, query.get("user_id")
        )
        data = event_analytics.build_events_page(
            resource,
            start_date=query.get("start_date"),
            end_date=query.get("end_date"),
            bucket=query["bucket"],
            user_id=user_filter,
            contributor_scope=contributor_scope,
            page=query["page"],
            page_size=query["page_size"],
        )
        return _validated_response(ResourceAnalyticsEventsSerializer, data)

    @extend_schema(
        summary="Export resource analytics events",
        request=None,
        parameters=[
            *ANALYTICS_TIME_PARAMETERS,
            OpenApiParameter("filename", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False),
        ],
        responses={"202": OpenApiResponse(RqIdSerializer)},
    )
    @action(detail=True, methods=["POST"], url_path="analytics/events/export")
    def analytics_events_export(self, request, pk=None):
        resource = self._resource_for_analytics()
        query = self._analytics_query(request)
        user_filter, _ = contributor_user_filter(request, resource, query.get("user_id"))
        resource_filter = event_analytics.resource_filter(resource)
        if user_filter is not None:
            resource_filter["user_id"] = user_filter
        exporter = EventsExporter(request=request, filter_override=resource_filter)
        return exporter.enqueue_job()
