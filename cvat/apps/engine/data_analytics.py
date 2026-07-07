# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""Real-time aggregation helpers for the admin-only Data Analytics dashboard.

All statistics are computed live with ORM aggregation (no cache tables).
The dashboard is global / staff-only; querysets are intentionally not scoped
to a single organization.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from django.conf import settings
from django.db.models import Count, Q, Sum

from cvat.apps.engine import models
from cvat.apps.engine.video_curation import _is_video_file, get_frame_extraction_dataset_usage

# A saved frame-extraction dataset can feed many tasks; cap the share scan and
# session-usage probing so the live endpoint stays responsive on large shares.
MAX_SHARE_VIDEOS_LISTED = 500
MAX_SESSIONS_LISTED = 200

_COMPLETED = models.StateChoice.COMPLETED.value
_ACCEPTANCE = models.StageChoice.ACCEPTANCE.value
_ANNOTATION_MODELS = (models.LabeledShape, models.LabeledTrack, models.LabeledImage)


# --------------------------------------------------------------------------- #
# Share / video helpers
# --------------------------------------------------------------------------- #
def _scan_share_videos() -> list[Path]:
    root = Path(settings.SHARE_ROOT)
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*") if _is_video_file(path))


def _processed_video_basenames() -> set[str]:
    """Basenames of source videos that actually produced extracted frames."""
    source_paths = (
        models.FrameExtractionFrame.objects.values_list("source_path", flat=True)
        .distinct()
    )
    return {Path(path).name for path in source_paths if path}


def _normalize_prefix(share_path: str) -> str:
    return (share_path or "").strip().replace("\\", "/").lstrip("/").rstrip("/")


# --------------------------------------------------------------------------- #
# Annotation aggregation
# --------------------------------------------------------------------------- #
def _annotation_totals_by_project() -> dict[int, int]:
    """Map project_id -> total annotation count (shapes + tracks + tags)."""
    totals: dict[int, int] = {}
    for model in _ANNOTATION_MODELS:
        rows = (
            model.objects.filter(job__segment__task__project_id__isnull=False)
            .values("job__segment__task__project_id")
            .annotate(count=Count("id"))
        )
        for row in rows:
            pid = row["job__segment__task__project_id"]
            totals[pid] = totals.get(pid, 0) + row["count"]
    return totals


def _annotation_totals_by_task(project_id: int) -> dict[int, int]:
    totals: dict[int, int] = {}
    for model in _ANNOTATION_MODELS:
        rows = (
            model.objects.filter(job__segment__task__project_id=project_id)
            .values("job__segment__task_id")
            .annotate(count=Count("id"))
        )
        for row in rows:
            tid = row["job__segment__task_id"]
            totals[tid] = totals.get(tid, 0) + row["count"]
    return totals


def _label_distribution(project_id: int) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for model in _ANNOTATION_MODELS:
        rows = (
            model.objects.filter(job__segment__task__project_id=project_id)
            .values("label__name")
            .annotate(count=Count("id"))
        )
        for row in rows:
            name = row["label__name"] or "(无标签)"
            counts[name] = counts.get(name, 0) + row["count"]
    return sorted(
        ({"label": name, "count": count} for name, count in counts.items()),
        key=lambda item: item["count"],
        reverse=True,
    )


def _shape_type_distribution(project_id: int) -> list[dict[str, Any]]:
    rows = (
        models.LabeledShape.objects.filter(job__segment__task__project_id=project_id)
        .values("type")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    return [{"type": row["type"], "count": row["count"]} for row in rows]


def _source_distribution(project_id: int) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for model in _ANNOTATION_MODELS:
        rows = (
            model.objects.filter(job__segment__task__project_id=project_id)
            .values("source")
            .annotate(count=Count("id"))
        )
        for row in rows:
            source = row["source"] or "unknown"
            counts[source] = counts.get(source, 0) + row["count"]
    return sorted(
        ({"source": source, "count": count} for source, count in counts.items()),
        key=lambda item: item["count"],
        reverse=True,
    )


def _completion_percent(completed: int, total: int) -> float:
    return round(completed / total * 100, 1) if total else 0.0


# --------------------------------------------------------------------------- #
# Frame-extraction session usage (explicit link + path inference)
# --------------------------------------------------------------------------- #
def link_task_to_frame_extraction(task: models.Task, server_files: list[str]) -> None:
    """Set task.source_frame_extraction when its share files live under a saved
    frame-extraction dataset directory. Called during task creation."""
    if task.source_frame_extraction_id:
        return

    candidates = [_normalize_prefix(path) for path in server_files if path]
    if not candidates:
        return

    saved = (
        models.FrameExtractionSession.objects.filter(
            status=models.FrameExtractionStatus.SAVED.value,
        )
        .exclude(output_share_path="")
        .only("id", "output_share_path")
    )
    for session in saved:
        prefix = _normalize_prefix(session.output_share_path)
        if prefix and any(f == prefix or f.startswith(prefix + "/") for f in candidates):
            task.source_frame_extraction_id = session.id
            return


def _session_usage(session: models.FrameExtractionSession) -> list[dict[str, Any]]:
    return get_frame_extraction_dataset_usage(session)


# --------------------------------------------------------------------------- #
# Public builders
# --------------------------------------------------------------------------- #
def build_overview() -> dict[str, Any]:
    sessions = models.FrameExtractionSession.objects
    session_status = {
        row["status"]: row["count"]
        for row in sessions.values("status").annotate(count=Count("id"))
    }
    frame_totals = sessions.aggregate(kept=Sum("kept_frames"), duplicate=Sum("duplicate_frames"))

    jobs = models.Job.objects
    job_state = {
        row["state"]: row["count"]
        for row in jobs.values("state").annotate(count=Count("id"))
    }
    job_stage = {
        row["stage"]: row["count"]
        for row in jobs.values("stage").annotate(count=Count("id"))
    }
    total_jobs = jobs.count()
    completed_jobs = jobs.filter(state=_COMPLETED, stage=_ACCEPTANCE).count()

    return {
        "share_videos": len(_scan_share_videos()),
        "frame_extraction": {
            "total": sessions.count(),
            "by_status": session_status,
            "saved_datasets": session_status.get(models.FrameExtractionStatus.SAVED.value, 0),
            "kept_frames": frame_totals["kept"] or 0,
            "duplicate_frames": frame_totals["duplicate"] or 0,
        },
        "projects": models.Project.objects.count(),
        "tasks": models.Task.objects.count(),
        "jobs": {
            "total": total_jobs,
            "completed": completed_jobs,
            "completion_percent": _completion_percent(completed_jobs, total_jobs),
            "by_state": job_state,
            "by_stage": job_stage,
        },
        "annotations": {
            "shapes": models.LabeledShape.objects.count(),
            "tracks": models.LabeledTrack.objects.count(),
            "tags": models.LabeledImage.objects.count(),
        },
    }


def build_projects_list(search: str = "", page: int = 1, page_size: int = 20) -> dict[str, Any]:
    queryset = models.Project.objects.select_related("owner", "organization")
    if search:
        queryset = queryset.filter(name__icontains=search)

    queryset = queryset.annotate(
        tasks_count=Count("task", distinct=True),
        jobs_count=Count("task__segment__job", distinct=True),
        completed_jobs=Count(
            "task__segment__job",
            filter=Q(task__segment__job__state=_COMPLETED)
            & Q(task__segment__job__stage=_ACCEPTANCE),
            distinct=True,
        ),
        labels_count=Count("label", distinct=True),
    ).order_by("-id")

    total = queryset.count()
    start = max(page - 1, 0) * page_size
    page_items = list(queryset[start:start + page_size])
    annotation_totals = _annotation_totals_by_project()

    results = [
        {
            "id": project.id,
            "name": project.name,
            "owner": project.owner.username if project.owner_id else None,
            "organization": project.organization.slug if project.organization_id else None,
            "tasks_count": project.tasks_count,
            "jobs_count": project.jobs_count,
            "completed_jobs": project.completed_jobs,
            "completion_percent": _completion_percent(project.completed_jobs, project.jobs_count),
            "labels_count": project.labels_count,
            "annotations": annotation_totals.get(project.id, 0),
        }
        for project in page_items
    ]
    return {"count": total, "page": page, "page_size": page_size, "results": results}


def build_project_detail(project: models.Project) -> dict[str, Any]:
    tasks = list(
        models.Task.objects.filter(project_id=project.id)
        .with_job_summary()
        .select_related("source_frame_extraction")
        .order_by("-id")
    )
    task_annotations = _annotation_totals_by_task(project.id)

    task_rows = [
        {
            "id": task.id,
            "name": task.name,
            "media_type": task.media_type,
            "jobs_count": task.total_jobs_count,
            "completed_jobs": task.completed_jobs_count,
            "completion_percent": _completion_percent(
                task.completed_jobs_count, task.total_jobs_count
            ),
            "annotations": task_annotations.get(task.id, 0),
            "source_frame_extraction": (
                str(task.source_frame_extraction_id)
                if task.source_frame_extraction_id
                else None
            ),
        }
        for task in tasks
    ]

    jobs = models.Job.objects.filter(segment__task__project_id=project.id)
    job_state = {
        row["state"]: row["count"]
        for row in jobs.values("state").annotate(count=Count("id"))
    }
    job_stage = {
        row["stage"]: row["count"]
        for row in jobs.values("stage").annotate(count=Count("id"))
    }
    total_jobs = sum(job_state.values())
    completed_jobs = jobs.filter(state=_COMPLETED, stage=_ACCEPTANCE).count()

    linked_sessions = (
        models.FrameExtractionSession.objects.filter(task__project_id=project.id)
        .distinct()
    )
    sessions = [
        {
            "id": str(session.id),
            "status": session.status,
            "output_share_path": session.output_share_path,
            "kept_frames": session.kept_frames,
        }
        for session in linked_sessions
    ]

    return {
        "id": project.id,
        "name": project.name,
        "owner": project.owner.username if project.owner_id else None,
        "organization": project.organization.slug if project.organization_id else None,
        "jobs": {
            "total": total_jobs,
            "completed": completed_jobs,
            "completion_percent": _completion_percent(completed_jobs, total_jobs),
            "by_state": job_state,
            "by_stage": job_stage,
        },
        "labels": _label_distribution(project.id),
        "shape_types": _shape_type_distribution(project.id),
        "sources": _source_distribution(project.id),
        "tasks": task_rows,
        "frame_extraction_sessions": sessions,
    }


def build_data_sources() -> dict[str, Any]:
    videos = _scan_share_videos()
    processed = _processed_video_basenames()
    root = Path(settings.SHARE_ROOT)

    video_rows = []
    for path in videos[:MAX_SHARE_VIDEOS_LISTED]:
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        video_rows.append({
            "path": path.relative_to(root).as_posix(),
            "size": size,
            "processed": path.name in processed,
        })

    sessions = (
        models.FrameExtractionSession.objects.select_related("owner")
        .order_by("-started_date", "-id")[:MAX_SESSIONS_LISTED]
    )
    session_rows = [
        {
            "id": str(session.id),
            "status": session.status,
            "owner": session.owner.username if session.owner_id else None,
            "total_videos": session.total_videos,
            "sampled_frames": session.sampled_frames,
            "kept_frames": session.kept_frames,
            "duplicate_frames": session.duplicate_frames,
            "output_share_path": session.output_share_path,
            "saved": session.status == models.FrameExtractionStatus.SAVED.value,
            "started_date": session.started_date,
            "finished_date": session.finished_date,
            "usage": _session_usage(session),
        }
        for session in sessions
    ]

    return {
        "videos": {
            "total": len(videos),
            "processed": sum(1 for row in video_rows if row["processed"]),
            "listed": len(video_rows),
            "results": video_rows,
        },
        "frame_extraction_sessions": session_rows,
    }
