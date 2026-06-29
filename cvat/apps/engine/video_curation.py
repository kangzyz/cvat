# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

import cv2
import numpy as np
from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from cvat.apps.engine import models
from cvat.apps.engine.media_extractors import get_mime
from cvat.utils.paths import join_untrusted_path, problem_with_untrusted_path


VIDEO_EXTENSIONS = {
    ".avi",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".webm",
}

OUTPUT_ROOT_NAME = "video-curation"
DATASET_NAME_RE = re.compile(r"^[\w .@+=-]+$")


class VideoCurationBackend:
    AUTO = "auto"
    CPU = "cpu"
    FFMPEG_GPU = "ffmpeg_gpu"

    CHOICES = (AUTO, CPU, FFMPEG_GPU)


class VideoCurationRequestSerializer(serializers.Serializer):
    client_files = serializers.ListField(
        child=serializers.FileField(),
        required=False,
        default=list,
        write_only=True,
    )
    share_paths = serializers.ListField(
        child=serializers.CharField(allow_blank=False, max_length=1024),
        required=False,
        default=list,
    )
    frame_interval = serializers.IntegerField(min_value=1, default=25)
    rotate_angle = serializers.IntegerField(min_value=-360, max_value=360, default=0)
    deduplicate = serializers.BooleanField(default=True)
    duplicate_threshold = serializers.IntegerField(min_value=0, max_value=64, default=4)
    recursive = serializers.BooleanField(default=True)
    image_quality = serializers.IntegerField(min_value=1, max_value=100, default=95)
    processing_backend = serializers.ChoiceField(
        choices=VideoCurationBackend.CHOICES,
        default=VideoCurationBackend.AUTO,
    )


class VideoCurationVideoResultSerializer(serializers.Serializer):
    source = serializers.CharField()
    saved = serializers.IntegerField()
    duplicates = serializers.IntegerField()
    sampled = serializers.IntegerField()
    total_frames = serializers.IntegerField(allow_null=True)
    backend = serializers.CharField()
    error = serializers.CharField(required=False, allow_blank=True)
    fallback_error = serializers.CharField(required=False, allow_blank=True)


class VideoCurationResponseSerializer(serializers.Serializer):
    share_path = serializers.CharField()
    output_dir = serializers.CharField()
    total_videos = serializers.IntegerField()
    processed_videos = serializers.IntegerField()
    failed_videos = serializers.IntegerField()
    sampled_frames = serializers.IntegerField()
    kept_frames = serializers.IntegerField()
    duplicate_frames = serializers.IntegerField()
    requested_backend = serializers.CharField()
    used_backend = serializers.CharField()
    videos = VideoCurationVideoResultSerializer(many=True)


class FrameExtractionRequestSerializer(serializers.Serializer):
    share_paths = serializers.ListField(
        child=serializers.CharField(allow_blank=False, max_length=1024),
        allow_empty=False,
    )
    frame_interval = serializers.IntegerField(min_value=1, default=25)
    rotate_angle = serializers.IntegerField(min_value=-360, max_value=360, default=0)
    deduplicate = serializers.BooleanField(default=True)
    duplicate_threshold = serializers.IntegerField(min_value=0, max_value=64, default=4)
    recursive = serializers.BooleanField(default=True)
    image_quality = serializers.IntegerField(min_value=1, max_value=100, default=95)
    processing_backend = serializers.ChoiceField(
        choices=VideoCurationBackend.CHOICES,
        default=VideoCurationBackend.AUTO,
    )

    def validate_share_paths(self, value: list[str]) -> list[str]:
        normalized = [_normalize_share_path(path) for path in value]
        if not normalized:
            raise serializers.ValidationError("Select a shared video path or directory")
        return normalized


class FrameExtractionStartResponseSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    rq_id = serializers.CharField()


class FrameExtractionSessionSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()
    excluded_frames = serializers.SerializerMethodField()

    class Meta:
        model = models.FrameExtractionSession
        fields = (
            "id",
            "status",
            "rq_id",
            "source_paths",
            "frame_interval",
            "rotate_angle",
            "deduplicate",
            "duplicate_threshold",
            "recursive",
            "image_quality",
            "processing_backend",
            "output_share_path",
            "total_videos",
            "processed_videos",
            "failed_videos",
            "sampled_frames",
            "kept_frames",
            "duplicate_frames",
            "excluded_frames",
            "used_backend",
            "error",
            "progress",
            "created_date",
            "updated_date",
            "started_date",
            "finished_date",
        )
        read_only_fields = fields

    def get_progress(self, instance: models.FrameExtractionSession) -> float:
        if instance.status in {
            models.FrameExtractionStatus.FINISHED,
            models.FrameExtractionStatus.SAVED,
        }:
            return 1.0
        if instance.status == models.FrameExtractionStatus.FAILED:
            return 0.0
        if not instance.total_videos:
            return 0.0
        return min(1.0, (instance.processed_videos + instance.failed_videos) / instance.total_videos)

    def get_excluded_frames(self, instance: models.FrameExtractionSession) -> int:
        return instance.frames.filter(excluded=True).count()


class FrameExtractionSessionPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    results = FrameExtractionSessionSerializer(many=True)


class FrameExtractionFrameSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = models.FrameExtractionFrame
        fields = (
            "id",
            "order",
            "name",
            "source_path",
            "source_frame",
            "width",
            "height",
            "file_size",
            "excluded",
            "created_date",
            "updated_date",
        )
        read_only_fields = fields

    def get_name(self, instance: models.FrameExtractionFrame) -> str:
        return Path(instance.file_path).name


class FrameExtractionFramesPatchSerializer(serializers.Serializer):
    exclude = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
    )
    restore = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        overlap = set(attrs.get("exclude", [])).intersection(attrs.get("restore", []))
        if overlap:
            raise serializers.ValidationError("The same frame cannot be excluded and restored")
        return attrs


class FrameExtractionSaveRequestSerializer(serializers.Serializer):
    output_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=128,
    )


class FrameExtractionSaveResponseSerializer(serializers.Serializer):
    share_path = serializers.CharField()
    kept_frames = serializers.IntegerField()


def _normalize_share_path(raw_path: str) -> str:
    path = raw_path.strip().replace("\\", "/")
    if path.startswith("/"):
        path = path[1:]

    if problem := problem_with_untrusted_path(path, allow_trailing_slash=True):
        raise ValidationError(f"{raw_path!r}: {problem}")

    return path.rstrip("/")


def _resolve_share_path(raw_path: str) -> Path:
    normalized_path = _normalize_share_path(raw_path)
    full_path = join_untrusted_path(settings.SHARE_ROOT, normalized_path)
    if not full_path.exists():
        raise ValidationError(f"{raw_path!r}: shared file or directory does not exist")

    return full_path


def _is_video_file(path: Path) -> bool:
    if not path.is_file():
        return False

    try:
        return get_mime(path) == "video"
    except Exception:
        return path.suffix.lower() in VIDEO_EXTENSIONS


def _collect_share_videos(share_paths: list[str], *, recursive: bool) -> list[Path]:
    videos: list[Path] = []

    for share_path in share_paths:
        source = _resolve_share_path(share_path)
        if source.is_file():
            if not _is_video_file(source):
                raise ValidationError(f"{share_path!r}: selected shared file is not a supported video")
            videos.append(source)
            continue

        iterator = source.rglob("*") if recursive else source.iterdir()
        videos.extend(path for path in iterator if _is_video_file(path))

    return sorted(dict.fromkeys(videos))


def _save_uploaded_videos(uploaded_files: list[UploadedFile], upload_dir: Path) -> list[Path]:
    videos: list[Path] = []

    for index, uploaded_file in enumerate(uploaded_files):
        suffix = Path(uploaded_file.name).suffix.lower()
        content_type = getattr(uploaded_file, "content_type", "") or ""
        if suffix not in VIDEO_EXTENSIONS and not content_type.startswith("video/"):
            raise ValidationError(f"{uploaded_file.name!r}: uploaded file is not a supported video")

        safe_name = Path(uploaded_file.name).name
        target_path = upload_dir / f"{index:04d}_{safe_name}"
        with target_path.open("wb") as output:
            for chunk in uploaded_file.chunks():
                output.write(chunk)
        videos.append(target_path)

    return videos


def _average_hash(frame: np.ndarray) -> int:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (8, 8), interpolation=cv2.INTER_AREA)
    average = small.mean()
    bits = small > average

    value = 0
    for bit in bits.flatten():
        value = (value << 1) | int(bit)
    return value


def _is_duplicate(frame_hash: int, kept_hashes: list[int], threshold: int) -> bool:
    return any((frame_hash ^ kept_hash).bit_count() <= threshold for kept_hash in kept_hashes)


def _rotate_frame(frame: np.ndarray, rotate_angle: int) -> np.ndarray:
    if rotate_angle == 0:
        return frame

    height, width = frame.shape[:2]
    rotation_matrix = cv2.getRotationMatrix2D((width / 2, height / 2), rotate_angle, 1)
    return cv2.warpAffine(frame, rotation_matrix, (width, height))


def _safe_imwrite(path: Path, image: np.ndarray, *, image_quality: int) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, buffer = cv2.imencode(
        path.suffix.lower() or ".jpg",
        image,
        [cv2.IMWRITE_JPEG_QUALITY, image_quality],
    )
    if not ok:
        return False

    buffer.tofile(str(path))
    return True


def _video_result(
    video_path: Path,
    *,
    backend: str,
    saved: int = 0,
    duplicates: int = 0,
    sampled: int = 0,
    total_frames: int | None = None,
    error: str | None = None,
    fallback_error: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "source": str(video_path),
        "saved": saved,
        "duplicates": duplicates,
        "sampled": sampled,
        "total_frames": total_frames,
        "backend": backend,
    }
    if error:
        result["error"] = error
    if fallback_error:
        result["fallback_error"] = fallback_error

    return result


def _get_total_frames(video_path: Path) -> int | None:
    capture = cv2.VideoCapture(str(video_path))
    try:
        if not capture.isOpened():
            return None
        return int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or None
    finally:
        capture.release()


def _ffmpeg_quality(image_quality: int) -> int:
    return max(2, min(31, round(31 - ((image_quality - 1) * 29 / 99))))


def _ffmpeg_supports_cuda(ffmpeg: str) -> bool:
    completed = subprocess.run(
        [ffmpeg, "-hide_banner", "-hwaccels"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return False

    return "cuda" in {line.strip().lower() for line in completed.stdout.splitlines()}


def _read_image(path: Path) -> np.ndarray | None:
    buffer = np.fromfile(str(path), dtype=np.uint8)
    if buffer.size == 0:
        return None
    return cv2.imdecode(buffer, cv2.IMREAD_COLOR)


def _process_sampled_frame(
    frame: np.ndarray,
    output_dir: Path,
    *,
    video_stem: str,
    saved: int,
    kept_hashes: list[int],
    rotate_angle: int,
    deduplicate: bool,
    duplicate_threshold: int,
    image_quality: int,
    source_frame: int | None = None,
    saved_frames: list[dict[str, Any]] | None = None,
) -> tuple[bool, bool, str | None]:
    frame = _rotate_frame(frame, rotate_angle)
    if frame.dtype != np.uint8:
        frame = np.clip(frame, 0, 255).astype(np.uint8)

    if deduplicate:
        frame_hash = _average_hash(frame)
        if _is_duplicate(frame_hash, kept_hashes, duplicate_threshold):
            return False, True, None
        kept_hashes.append(frame_hash)

    frame_name = f"{video_stem}_{saved:06d}.jpg"
    frame_path = output_dir / frame_name
    if not _safe_imwrite(frame_path, frame, image_quality=image_quality):
        return False, False, f"Unable to write frame {frame_name}"

    if saved_frames is not None:
        height, width = frame.shape[:2]
        saved_frames.append(
            {
                "path": frame_path,
                "source_frame": source_frame,
                "width": width,
                "height": height,
                "file_size": frame_path.stat().st_size if frame_path.exists() else 0,
            }
        )

    return True, False, None


def _process_video_cpu(
    video_path: Path,
    output_dir: Path,
    *,
    video_index: int,
    frame_interval: int,
    rotate_angle: int,
    deduplicate: bool,
    duplicate_threshold: int,
    image_quality: int,
    saved_frames: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return _video_result(
            video_path,
            backend=VideoCurationBackend.CPU,
            error="Unable to open video",
        )

    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or None
    kept_hashes: list[int] = []
    saved = 0
    sampled = 0
    duplicates = 0
    frame_number = 0
    video_stem = f"{video_index:04d}_{video_path.stem}"

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            if frame_number % frame_interval != 0:
                frame_number += 1
                continue

            current_frame_number = frame_number
            frame_number += 1
            sampled += 1

            saved_frame, duplicate_frame, error = _process_sampled_frame(
                frame,
                output_dir,
                video_stem=video_stem,
                saved=saved,
                kept_hashes=kept_hashes,
                rotate_angle=rotate_angle,
                deduplicate=deduplicate,
                duplicate_threshold=duplicate_threshold,
                image_quality=image_quality,
                source_frame=current_frame_number,
                saved_frames=saved_frames,
            )
            if duplicate_frame:
                duplicates += 1
                continue
            if error:
                return _video_result(
                    video_path,
                    backend=VideoCurationBackend.CPU,
                    saved=saved,
                    duplicates=duplicates,
                    sampled=sampled,
                    total_frames=total_frames,
                    error=error,
                )
            if saved_frame:
                saved += 1
    finally:
        capture.release()

    return _video_result(
        video_path,
        backend=VideoCurationBackend.CPU,
        saved=saved,
        duplicates=duplicates,
        sampled=sampled,
        total_frames=total_frames,
    )


def _process_video_ffmpeg_gpu(
    video_path: Path,
    output_dir: Path,
    *,
    video_index: int,
    frame_interval: int,
    rotate_angle: int,
    deduplicate: bool,
    duplicate_threshold: int,
    image_quality: int,
    saved_frames: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return _video_result(
            video_path,
            backend=VideoCurationBackend.FFMPEG_GPU,
            error="ffmpeg is not installed in the server container",
        )
    if not _ffmpeg_supports_cuda(ffmpeg):
        return _video_result(
            video_path,
            backend=VideoCurationBackend.FFMPEG_GPU,
            error="ffmpeg in the server container was not built with CUDA/NVDEC support",
        )

    total_frames = _get_total_frames(video_path)
    video_stem = f"{video_index:04d}_{video_path.stem}"
    quality = _ffmpeg_quality(image_quality)

    with tempfile.TemporaryDirectory(prefix="cvat-video-curation-gpu-") as temp_dir:
        temp_path = Path(temp_dir)
        sample_pattern = temp_path / "sample_%08d.jpg"
        select_filter = f"select=not(mod(n\\,{frame_interval}))"
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-hwaccel",
            "cuda",
            "-i",
            str(video_path),
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            select_filter,
            "-fps_mode",
            "vfr",
            "-q:v",
            str(quality),
            str(sample_pattern),
        ]

        completed = subprocess.run(
            command,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if completed.returncode != 0:
            stderr = completed.stderr.strip().splitlines()
            details = stderr[-1] if stderr else "ffmpeg exited with a non-zero status"
            return _video_result(
                video_path,
                backend=VideoCurationBackend.FFMPEG_GPU,
                total_frames=total_frames,
                error=f"GPU ffmpeg extraction failed: {details}",
            )

        sampled_paths = sorted(temp_path.glob("sample_*.jpg"))
        if not sampled_paths:
            return _video_result(
                video_path,
                backend=VideoCurationBackend.FFMPEG_GPU,
                total_frames=total_frames,
                error="GPU ffmpeg extraction produced no frames",
            )

        kept_hashes: list[int] = []
        saved = 0
        duplicates = 0

        for sampled_index, sampled_path in enumerate(sampled_paths):
            frame = _read_image(sampled_path)
            if frame is None:
                return _video_result(
                    video_path,
                    backend=VideoCurationBackend.FFMPEG_GPU,
                    saved=saved,
                    duplicates=duplicates,
                    sampled=len(sampled_paths),
                    total_frames=total_frames,
                    error=f"Unable to read sampled frame {sampled_path.name}",
                )

            saved_frame, duplicate_frame, error = _process_sampled_frame(
                frame,
                output_dir,
                video_stem=video_stem,
                saved=saved,
                kept_hashes=kept_hashes,
                rotate_angle=rotate_angle,
                deduplicate=deduplicate,
                duplicate_threshold=duplicate_threshold,
                image_quality=image_quality,
                source_frame=sampled_index * frame_interval,
                saved_frames=saved_frames,
            )
            if duplicate_frame:
                duplicates += 1
                continue
            if error:
                return _video_result(
                    video_path,
                    backend=VideoCurationBackend.FFMPEG_GPU,
                    saved=saved,
                    duplicates=duplicates,
                    sampled=len(sampled_paths),
                    total_frames=total_frames,
                    error=error,
                )
            if saved_frame:
                saved += 1

    return _video_result(
        video_path,
        backend=VideoCurationBackend.FFMPEG_GPU,
        saved=saved,
        duplicates=duplicates,
        sampled=len(sampled_paths),
        total_frames=total_frames,
    )


def _process_video(
    video_path: Path,
    output_dir: Path,
    *,
    video_index: int,
    frame_interval: int,
    rotate_angle: int,
    deduplicate: bool,
    duplicate_threshold: int,
    image_quality: int,
    processing_backend: str,
    saved_frames: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    common_kwargs = {
        "video_index": video_index,
        "frame_interval": frame_interval,
        "rotate_angle": rotate_angle,
        "deduplicate": deduplicate,
        "duplicate_threshold": duplicate_threshold,
        "image_quality": image_quality,
    }

    if processing_backend in (VideoCurationBackend.AUTO, VideoCurationBackend.FFMPEG_GPU):
        gpu_saved_frames: list[dict[str, Any]] | None = [] if saved_frames is not None else None
        gpu_result = _process_video_ffmpeg_gpu(
            video_path, output_dir, saved_frames=gpu_saved_frames, **common_kwargs
        )
        if not gpu_result.get("error") or processing_backend == VideoCurationBackend.FFMPEG_GPU:
            if saved_frames is not None and gpu_saved_frames is not None:
                saved_frames.extend(gpu_saved_frames)
            return gpu_result

        if gpu_saved_frames:
            for saved_frame in gpu_saved_frames:
                Path(saved_frame["path"]).unlink(missing_ok=True)

        cpu_saved_frames: list[dict[str, Any]] | None = [] if saved_frames is not None else None
        cpu_result = _process_video_cpu(
            video_path, output_dir, saved_frames=cpu_saved_frames, **common_kwargs
        )
        if saved_frames is not None and cpu_saved_frames is not None:
            saved_frames.extend(cpu_saved_frames)
        cpu_result["fallback_error"] = gpu_result["error"]
        return cpu_result

    cpu_saved_frames = [] if saved_frames is not None else None
    cpu_result = _process_video_cpu(
        video_path, output_dir, saved_frames=cpu_saved_frames, **common_kwargs
    )
    if saved_frames is not None and cpu_saved_frames is not None:
        saved_frames.extend(cpu_saved_frames)
    return cpu_result


def _summarize_used_backend(video_results: list[dict[str, Any]]) -> str:
    used_backends = {
        item["backend"] for item in video_results if item.get("saved") and not item.get("error")
    }
    if not used_backends:
        return "none"
    if len(used_backends) == 1:
        return next(iter(used_backends))
    return "mixed"


def prepare_video_dataset(validated_data: dict[str, Any]) -> dict[str, Any]:
    share_paths = validated_data.get("share_paths", [])
    uploaded_files = validated_data.get("client_files", [])

    if not share_paths and not uploaded_files:
        raise ValidationError("Select a shared video path or upload a video file")

    request_id = uuid4().hex
    output_root = settings.SHARE_ROOT / OUTPUT_ROOT_NAME / request_id
    frames_dir = output_root / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    temporary_upload_dir: tempfile.TemporaryDirectory[str] | None = None
    videos: list[Path] = []

    try:
        if uploaded_files:
            temporary_upload_dir = tempfile.TemporaryDirectory(prefix="cvat-video-curation-")
            videos.extend(_save_uploaded_videos(uploaded_files, Path(temporary_upload_dir.name)))

        if share_paths:
            videos.extend(
                _collect_share_videos(share_paths, recursive=validated_data["recursive"])
            )

        videos = sorted(dict.fromkeys(videos))
        if not videos:
            raise ValidationError("No supported videos were found")

        processing_backend = validated_data["processing_backend"]
        video_results = [
            _process_video(
                video,
                frames_dir,
                video_index=video_index,
                frame_interval=validated_data["frame_interval"],
                rotate_angle=validated_data["rotate_angle"],
                deduplicate=validated_data["deduplicate"],
                duplicate_threshold=validated_data["duplicate_threshold"],
                image_quality=validated_data["image_quality"],
                processing_backend=processing_backend,
            )
            for video_index, video in enumerate(videos)
        ]

        kept_frames = sum(item["saved"] for item in video_results)
        if kept_frames == 0:
            errors = [item["error"] for item in video_results if item.get("error")]
            raise ValidationError(
                errors[0] if errors else "No frames were extracted from the selected videos"
            )

        result = {
            "share_path": f"{OUTPUT_ROOT_NAME}/{request_id}/frames/",
            "output_dir": str(frames_dir),
            "total_videos": len(videos),
            "processed_videos": sum(1 for item in video_results if not item.get("error")),
            "failed_videos": sum(1 for item in video_results if item.get("error")),
            "sampled_frames": sum(item["sampled"] for item in video_results),
            "kept_frames": kept_frames,
            "duplicate_frames": sum(item["duplicates"] for item in video_results),
            "requested_backend": processing_backend,
            "used_backend": _summarize_used_backend(video_results),
            "videos": video_results,
        }

        (output_root / "manifest.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return result
    except Exception:
        shutil.rmtree(output_root, ignore_errors=True)
        raise
    finally:
        if temporary_upload_dir is not None:
            temporary_upload_dir.cleanup()


def _as_share_path(path: Path, *, directory: bool = False) -> str:
    share_path = path.relative_to(settings.SHARE_ROOT).as_posix()
    if directory and not share_path.endswith("/"):
        share_path += "/"
    return share_path


def _normalize_dataset_output_name(raw_name: str | None, session_id: str) -> str:
    dataset_name = (raw_name or "").strip().replace("\\", "/")
    if not dataset_name:
        dataset_name = session_id

    if "/" in dataset_name:
        raise ValidationError("Dataset name must be a single directory name")
    if dataset_name in {".", ".."}:
        raise ValidationError("Dataset name is invalid")
    if not DATASET_NAME_RE.fullmatch(dataset_name):
        raise ValidationError(
            "Dataset name can contain letters, numbers, spaces, underscores, dots, hyphens, @, +, and ="
        )
    if problem := problem_with_untrusted_path(dataset_name, allow_trailing_slash=False):
        raise ValidationError(f"Dataset name is invalid: {problem}")

    return dataset_name


def _session_work_dir(session: models.FrameExtractionSession) -> Path:
    if not session.work_share_path:
        session.work_share_path = f"{OUTPUT_ROOT_NAME}/work/{session.id}/frames/"
        session.save(update_fields=["work_share_path"])

    return join_untrusted_path(settings.SHARE_ROOT, session.work_share_path)


def _update_session_stats(
    session: models.FrameExtractionSession,
    video_results: list[dict[str, Any]],
) -> None:
    session.processed_videos = sum(1 for item in video_results if not item.get("error"))
    session.failed_videos = sum(1 for item in video_results if item.get("error"))
    session.sampled_frames = sum(item["sampled"] for item in video_results)
    session.kept_frames = sum(item["saved"] for item in video_results)
    session.duplicate_frames = sum(item["duplicates"] for item in video_results)
    session.used_backend = _summarize_used_backend(video_results)


def run_frame_extraction_session(session_id: str) -> str:
    session = models.FrameExtractionSession.objects.get(pk=session_id)
    frames_dir = _session_work_dir(session)
    frames_dir.mkdir(parents=True, exist_ok=True)

    video_results: list[dict[str, Any]] = []

    try:
        session.status = models.FrameExtractionStatus.STARTED
        session.started_date = timezone.now()
        session.error = ""
        session.save(update_fields=["status", "started_date", "error", "work_share_path"])

        videos = _collect_share_videos(session.source_paths, recursive=session.recursive)
        videos = sorted(dict.fromkeys(videos))
        if not videos:
            raise ValidationError("No supported videos were found")

        session.total_videos = len(videos)
        session.frames.all().delete()
        session.save(update_fields=["total_videos"])

        next_order = 0
        for video_index, video in enumerate(videos):
            saved_frames: list[dict[str, Any]] = []
            result = _process_video(
                video,
                frames_dir,
                video_index=video_index,
                frame_interval=session.frame_interval,
                rotate_angle=session.rotate_angle,
                deduplicate=session.deduplicate,
                duplicate_threshold=session.duplicate_threshold,
                image_quality=session.image_quality,
                processing_backend=session.processing_backend,
                saved_frames=saved_frames,
            )
            video_results.append(result)

            source_path = _as_share_path(video)
            models.FrameExtractionFrame.objects.bulk_create(
                [
                    models.FrameExtractionFrame(
                        session=session,
                        order=next_order + index,
                        file_path=_as_share_path(saved_frame["path"]),
                        source_path=source_path,
                        video_index=video_index,
                        source_frame=saved_frame["source_frame"],
                        width=saved_frame["width"],
                        height=saved_frame["height"],
                        file_size=saved_frame["file_size"],
                    )
                    for index, saved_frame in enumerate(saved_frames)
                ]
            )
            next_order += len(saved_frames)

            _update_session_stats(session, video_results)
            session.save(
                update_fields=[
                    "processed_videos",
                    "failed_videos",
                    "sampled_frames",
                    "kept_frames",
                    "duplicate_frames",
                    "used_backend",
                    "updated_date",
                ]
            )

        if session.kept_frames == 0:
            errors = [item["error"] for item in video_results if item.get("error")]
            raise ValidationError(
                errors[0] if errors else "No frames were extracted from the selected videos"
            )

        session.status = models.FrameExtractionStatus.FINISHED
        session.finished_date = timezone.now()
        session.save(update_fields=["status", "finished_date", "updated_date"])
        return str(session.id)
    except Exception as ex:
        session.frames.all().delete()
        session.status = models.FrameExtractionStatus.FAILED
        session.error = str(ex)
        session.finished_date = timezone.now()
        session.save(update_fields=["status", "error", "finished_date", "updated_date"])
        shutil.rmtree(frames_dir.parent, ignore_errors=True)
        raise


def save_frame_extraction_dataset(
    session: models.FrameExtractionSession,
    output_name: str | None = None,
) -> dict[str, Any]:
    if session.status == models.FrameExtractionStatus.FAILED:
        raise ValidationError("Cannot save a failed frame extraction session")

    if session.output_share_path:
        return {
            "share_path": session.output_share_path,
            "kept_frames": session.frames.filter(excluded=False).count(),
        }

    if session.status != models.FrameExtractionStatus.FINISHED:
        raise ValidationError("Frame extraction is not finished yet")

    kept_frames = list(session.frames.filter(excluded=False).order_by("order"))
    if not kept_frames:
        raise ValidationError("Cannot save a dataset without kept frames")

    dataset_name = _normalize_dataset_output_name(output_name, str(session.id))
    output_dir = settings.SHARE_ROOT / OUTPUT_ROOT_NAME / "datasets" / dataset_name
    output_share_path = _as_share_path(output_dir, directory=True)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValidationError(
            f"Dataset directory {output_share_path!r} already exists. Choose another name."
        )
    had_output_dir = output_dir.exists()
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        for frame in kept_frames:
            source_path = join_untrusted_path(settings.SHARE_ROOT, frame.file_path)
            if not source_path.is_file():
                raise ValidationError(f"Extracted frame {frame.id} is missing")
            shutil.copyfile(source_path, output_dir / Path(frame.file_path).name)
    except Exception:
        if not had_output_dir:
            shutil.rmtree(output_dir, ignore_errors=True)
        raise

    session.output_share_path = output_share_path
    session.status = models.FrameExtractionStatus.SAVED
    session.finished_date = session.finished_date or timezone.now()
    session.save(update_fields=["output_share_path", "status", "finished_date", "updated_date"])

    return {
        "share_path": session.output_share_path,
        "kept_frames": len(kept_frames),
    }


def delete_frame_extraction_session(session: models.FrameExtractionSession) -> None:
    if session.output_share_path or session.status == models.FrameExtractionStatus.SAVED:
        raise ValidationError("Saved frame extraction sessions cannot be deleted")

    if session.status not in {
        models.FrameExtractionStatus.FINISHED,
        models.FrameExtractionStatus.FAILED,
    }:
        raise ValidationError("Only unsaved or failed frame extraction sessions can be deleted")

    work_share_path = session.work_share_path or f"{OUTPUT_ROOT_NAME}/work/{session.id}/frames/"
    work_dir = join_untrusted_path(settings.SHARE_ROOT, work_share_path)
    cleanup_dir = work_dir.parent if work_dir.name == "frames" else work_dir
    shutil.rmtree(cleanup_dir, ignore_errors=True)
    session.delete()
