## Serverless for Computer Vision Annotation Tool (CVAT)

### Run docker container

```bash
# From project root directory
docker compose -f docker-compose.yml -f components/serverless/docker-compose.serverless.yml up -d
```

### Local YOLO runtime image

For local `.pt` model upload, production deployments should use a prebuilt runtime image
with `ultralytics`, `opencv-python-headless`, `pillow`, and `torch` installed:

```bash
docker build -f components/serverless/local-yolo-runtime.Dockerfile \
  --build-arg BASE_IMAGE=python:3.10-slim \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
  -t your-registry/local-yolo-runtime:py310-ultralytics .
docker push your-registry/local-yolo-runtime:py310-ultralytics
```

Then set these values in the deployment `.env`:

```bash
CVAT_LOCAL_MODEL_DEPLOYMENT_BASE_IMAGE=your-registry/local-yolo-runtime:py310-ultralytics
CVAT_LOCAL_MODEL_DEPLOYMENT_INSTALL_DEPENDENCIES=0
CVAT_LOCAL_MODEL_DEPLOYMENT_NO_BASE_IMAGES_PULL=1
CVAT_LOCAL_MODEL_DEPLOYMENT_GPU_LIMIT=1
```

With this mode enabled, uploading a model only stages `model.pt`, `main.py`, and
`labels.json`; the generated Nuclio function does not run `pip install`.
Set `CVAT_LOCAL_MODEL_DEPLOYMENT_GPU_LIMIT=1` only on hosts with NVIDIA Container
Toolkit available; generated functions request one GPU and prefer `cuda:0`.
