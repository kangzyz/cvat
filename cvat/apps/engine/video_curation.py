# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from __future__ import annotations

import json
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
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

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
    if not _safe_imwrite(output_dir / frame_name, frame, image_quality=image_quality):
        return False, False, f"Unable to write frame {frame_name}"

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

        for sampled_path in sampled_paths:
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
        gpu_result = _process_video_ffmpeg_gpu(video_path, output_dir, **common_kwargs)
        if not gpu_result.get("error") or processing_backend == VideoCurationBackend.FFMPEG_GPU:
            return gpu_result

        cpu_result = _process_video_cpu(video_path, output_dir, **common_kwargs)
        cpu_result["fallback_error"] = gpu_result["error"]
        return cpu_result

    return _process_video_cpu(video_path, output_dir, **common_kwargs)


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
