ARG BASE_IMAGE=python:3.10-slim

FROM ${BASE_IMAGE}

ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_EXTRA_INDEX_URL=
ARG PIP_TRUSTED_HOST=

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        libglib2.0-0 \
        libgl1 && \
    rm -rf /var/lib/apt/lists/*

RUN python -m pip install \
        ${PIP_INDEX_URL:+-i ${PIP_INDEX_URL}} \
        ${PIP_EXTRA_INDEX_URL:+--extra-index-url ${PIP_EXTRA_INDEX_URL}} \
        ${PIP_TRUSTED_HOST:+--trusted-host ${PIP_TRUSTED_HOST}} \
        ultralytics \
        opencv-python-headless \
        pillow \
        torch \
        --no-cache-dir

ENV YOLO_CONFIG_DIR=/tmp
