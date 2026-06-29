[![CVAT Community header](site/content/en/images/cvat_github_header.webp)](https://github.com/kangzyz/cvat)
# CVAT：计算机视觉标注工具（中文社区版）

[![Release][release-img]][release-url]
[![GitHub stars][stars-img]][stars-url]
[![License][license-img]][license-url]
[![Discord][discord-img]][discord-url]

[源码仓库](https://github.com/kangzyz/cvat) ·
[更新日志](https://github.com/kangzyz/cvat/blob/develop/CHANGELOG.md) ·
[内置中文指南](#内置中文使用指南) ·
[问题反馈](https://github.com/kangzyz/cvat/issues)

> 本仓库是 [CVAT](https://github.com/cvat-ai/cvat) 的简体中文本地化改造版本，专注于**自托管社区版**。
> 在保持原有接口、枚举值、路由和数据格式不变的前提下，将用户可见的前端页面、弹窗、通知、校验提示、
> 快捷键说明、标注工作区与音频工作区提示统一为标准中文，并内置了一套离线中文使用指南。

## CVAT 是什么

CVAT（Computer Vision Annotation Tool）是一款广受欢迎的开源数据标注平台，用于为计算机视觉与视觉 AI
构建高质量数据集。自 2018 年开源以来，它已成为计算机视觉领域最知名的标注工具之一，拥有庞大的开源社区，
被大量科研与生产团队采用。

**社区版（Community）** 是 CVAT 免费、可自托管的开源版本，基于 MIT 许可证发布。它支持图像、视频与 3D
点云标注、数据集管理、团队协作、云存储接入，以及面向开发者的 SDK 与 API，让你完全掌控自己的数据与标注基础设施。

选择社区版的理由：

- **数据自主可控**：完全运行在你自己的基础设施中，数据不出本地环境。
- **AI 辅助标注**：接入自有 ML 模型进行检测、分割与跟踪，加速标注。
- **团队协作**：支持多用户、多组织，提供角色、任务分配与审核流程。
- **MIT 开源核心**：可在 MIT 许可证下自由使用、修改与分发（部分 serverless 资源与依赖可能有独立许可证）。
- **真正的开源**：自 2018 年起在 GitHub 上透明开发、活跃维护。

## 快速开始

### 环境要求

- [Docker Engine](https://docs.docker.com/engine/install/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Git](https://git-scm.com/)

> 💡 CVAT 主要在基于 Chromium 的浏览器（Google Chrome、Microsoft Edge）上测试。Firefox 可基本使用，
> 不支持 Safari/WebKit。

### 1. 启动默认服务

克隆仓库并启动服务：

```bash
git clone https://github.com/kangzyz/cvat
cd cvat

# 可选：设置对外访问的 IP 或域名
# export CVAT_HOST=your-ip-or-domain

docker compose up -d
```

如需本地开发调试，可叠加开发配置（会额外暴露 PostgreSQL、Redis 等端口）：

```bash
# 构建本地开发镜像（包含 cvat/server:dev 和 cvat/ui:dev）
docker compose -f docker-compose.yml -f docker-compose.dev.yml build

# 启动并暴露开发端口
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 2. 创建管理员账号

```bash
docker exec -it cvat_server bash -ic 'python3 ~/manage.py createsuperuser'
```

### 3. 登录并开始标注

- 在浏览器打开 [http://localhost:8080](http://localhost:8080)（若设置了 `CVAT_HOST` 则使用对应主机名/域名）。
- 使用超级管理员账号登录。
- 创建项目或任务，上传数据（图像、视频或点云），定义标签后即可开始标注。

> ⚠️ 本仓库**默认关闭公开注册**，仅允许管理员在
> [http://localhost:8080/admin/](http://localhost:8080/admin/) 后台添加用户。
> 如需临时开放注册，可设置环境变量 `CVAT_REGISTRATION_ENABLED=true` 后重启后端服务。

## 内置中文使用指南

本仓库已将使用指南**汉化并内置到前端**，无需访问外部站点。登录后点击顶部导航栏右侧的 **问号（?）图标**，
即可打开离线中文文档，涵盖：概述、快速开始、安装部署、界面导航、项目与任务管理、手动标注、标注形状、
自动标注、数据集管理、快捷键与常见问题。文档内容仅包含社区版功能。

## 核心功能

- **手动与自动标注**：使用矩形框、多边形、蒙版、关键点、长方体、标签等对图像、视频和 3D 点云进行标注；
  可接入自有模型进行自动预标注以提速。
- **任务管理**：将数据集组织为项目，再拆分为任务与作业，分配给标注员并实时跟踪进度。
- **团队协作**：创建组织、邀请成员、分配角色，通过评论与问题（Issue）协同标注与审核。
- **质量控制**：通过 Ground Truth 作业评估标注质量，查看质量设置、报告摘要、验证帧与冲突统计。
- **数据导入导出与集成**：支持 20+ 种格式（COCO、YOLO、Pascal VOC、KITTI 等）导入导出，接入云存储，
  并可通过 REST API 与 Python SDK 自动化。
- **抽帧筛选工作台**：从共享视频或目录批量抽帧、去重并人工筛选，将干净的数据集一键流转到任务创建。

## 本地社区版可用化

本地社区版默认启用质量控制后端与质量报告 worker，并将质量控制概览页替换为社区版可用视图。进入任务或项目的
“质量控制”后，可查看质量设置、最近一次质量报告摘要、验证帧与冲突统计；任务包含 Ground Truth 作业后，
质量控制结果会在概览中展示。

自动标注模型依赖 Nuclio serverless。若只启动基础服务，模型列表可以打开，但无法部署或调用模型。启用 serverless 组件：

```bash
docker compose -f docker-compose.yml -f components/serverless/docker-compose.serverless.yml up -d
```

本仓库为本地部署增加了 YOLO `.pt` 上传入口。启动 serverless 组件后，管理员可在“模型”页面点击
“上传 YOLO 模型”，上传训练得到的 `.pt` 文件，并按训练类别顺序填写标签列表。系统会将模型封装为
Nuclio detector，部署成功后会自动出现在模型列表中，可用于自动标注。

注意事项：

- 该功能仅适合本地或可信内网部署，`components/serverless/docker-compose.serverless.yml` 会为
  `cvat_server` 挂载 Docker socket 并开启 `CVAT_LOCAL_MODEL_DEPLOYMENT=1`。
- `cvat_server` 镜像内置与 Nuclio Dashboard 匹配的 `nuctl 1.16.3`。
- 默认模式下，首次部署 YOLO `.pt` 模型会构建函数镜像并下载 `ultralytics`/PyTorch 依赖，耗时取决于网络与机器性能。
- 生产环境建议使用预装依赖的 YOLO runtime 基础镜像，并关闭函数构建阶段的 `pip install`，避免每次上传模型都重新下载大依赖。
- 目前支持矩形检测类型，标签顺序必须与训练模型类别顺序一致。

预装 YOLO runtime 镜像的构建方式：

```bash
docker build -f components/serverless/local-yolo-runtime.Dockerfile \
  --build-arg BASE_IMAGE=python:3.10-slim \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
  -t your-registry/local-yolo-runtime:py310-ultralytics .
docker push your-registry/local-yolo-runtime:py310-ultralytics
```

服务器 `.env` 中推荐使用：

```bash
DOCKER_GID=<stat -c '%g' /var/run/docker.sock 的输出值>
CVAT_LOCAL_MODEL_DEPLOYMENT_BASE_IMAGE=your-registry/local-yolo-runtime:py310-ultralytics
CVAT_LOCAL_MODEL_DEPLOYMENT_INSTALL_DEPENDENCIES=0
CVAT_LOCAL_MODEL_DEPLOYMENT_NO_BASE_IMAGES_PULL=1
```

其中 `DOCKER_GID` 应使用服务器实际 Docker socket 组 ID。先在服务器执行：

```bash
stat -c '%g' /var/run/docker.sock
```

再把输出的数字写入 `.env`。`--env-file .env` 不会执行 `$(...)` 命令替换。

如果暂时不使用预装 runtime 镜像，仍可保留默认的函数内安装依赖模式，并在 `.env` 中增加国内 PyPI 源：

```bash
CVAT_LOCAL_MODEL_DEPLOYMENT_INSTALL_DEPENDENCIES=1
CVAT_LOCAL_MODEL_DEPLOYMENT_PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
```

启用 `CVAT_LOCAL_MODEL_DEPLOYMENT_NO_BASE_IMAGES_PULL=1` 后，Nuclio 构建时不会主动访问 `gcr.io`/`quay.io`
拉取依赖镜像，需要先在服务器上预拉并打成本地原始标签：

```bash
docker pull m.daocloud.io/docker.io/library/alpine:3.20
docker tag m.daocloud.io/docker.io/library/alpine:3.20 gcr.io/iguazio/alpine:3.20

docker pull m.daocloud.io/gcr.io/iguazio/uhttpc:0.0.3-amd64
docker tag m.daocloud.io/gcr.io/iguazio/uhttpc:0.0.3-amd64 gcr.io/iguazio/uhttpc:0.0.3-amd64

docker pull m.daocloud.io/quay.io/nuclio/handler-builder-python-onbuild:1.16.3-amd64
docker tag m.daocloud.io/quay.io/nuclio/handler-builder-python-onbuild:1.16.3-amd64 quay.io/nuclio/handler-builder-python-onbuild:1.16.3-amd64

docker pull m.daocloud.io/docker.io/library/python:3.10-slim
docker tag m.daocloud.io/docker.io/library/python:3.10-slim python:3.10-slim
```

### 抽帧筛选工作台

本仓库新增了独立的**抽帧筛选工作台**，从顶部导航栏的“抽帧筛选”进入，用于在创建标注任务前从原始视频中
快速准备数据集：

1. 指定共享目录中的视频或目录（支持递归遍历子目录）。
2. 设置抽帧间隔、去重阈值、旋转角度与图片质量，可开启自动去重。
3. 预览采样得到的帧，逐帧选择“保留 / 排除”，并可按“全部 / 保留 / 已排除”筛选查看。
4. 填写数据集目录名，将筛选后的结果保存到共享目录。
5. 历史抽帧任务会保留在“历史任务”中，可随时查看或继续处理。

保存后可一键流转到任务创建页：创建任务页会自动预载该共享路径并建议任务名称，省去重复选择数据的步骤。

> 该功能依赖共享目录（`cvat_share`）。请确保已将待处理视频/目录挂载到 CVAT 的共享存储中。

## 开发者工具

CVAT 面向自动化设计。除 Web 界面外，你还可以通过以下方式将其集成到流水线中：

- **Python SDK**：`pip install cvat-sdk`，用 Python 自动化创建任务、上传与导出。
- **命令行工具**：`pip install cvat-cli`，在终端脚本化常见的 CVAT 工作流。
- **REST API**：对 CVAT 进行完整的编程式控制。

## 数据与格式

社区版支持图像、视频和 3D（点云）标注工作流，可使用 20+ 种业界标准格式导入导出数据：
CVAT (XML)、COCO (JSON)、YOLO (TXT)、Ultralytics YOLO (TXT/YAML)、Pascal VOC (XML)、KITTI (TXT)、
MOT (TXT) 等。

## 机器学习与 AI 模型

社区版支持通过 Nuclio 驱动的预置 serverless 模型进行自动标注，涵盖检测、分割、姿态估计与跟踪：

| 模型 | 框架 | 类型 |
| --- | --- | --- |
| [Segment Anything (SAM)](https://github.com/kangzyz/cvat/tree/develop/serverless/pytorch/facebookresearch/sam/nuclio) | PyTorch | 交互式分割 |
| [Inside-Outside Guidance (IOG)](https://github.com/kangzyz/cvat/tree/develop/serverless/pytorch/shiyinzhang/iog/nuclio) | PyTorch | 交互式分割 |
| [RetinaNet R101](https://github.com/kangzyz/cvat/tree/develop/serverless/pytorch/facebookresearch/detectron2/retinanet_r101/nuclio) | PyTorch | 检测 |
| [HRNet32 Whole Body Pose](https://github.com/kangzyz/cvat/tree/develop/serverless/pytorch/mmpose/hrnet32/nuclio) | PyTorch | 姿态估计 |
| [TransT](https://github.com/kangzyz/cvat/tree/develop/serverless/pytorch/dschoerk/transt/nuclio) | PyTorch | 跟踪 |
| [YOLO v7](https://github.com/kangzyz/cvat/tree/develop/serverless/onnx/WongKinYiu/yolov7/nuclio) | ONNX | 检测 |
| [Mask RCNN Inception ResNet v2](https://github.com/kangzyz/cvat/tree/develop/serverless/openvino/omz/public/mask_rcnn_inception_resnet_v2_atrous_coco/nuclio) | OpenVINO | 检测 |
| [Face Detection 0205](https://github.com/kangzyz/cvat/tree/develop/serverless/openvino/omz/intel/face-detection-0205/nuclio) | OpenVINO | 检测 |
| [Faster RCNN Inception v2](https://github.com/kangzyz/cvat/tree/develop/serverless/tensorflow/faster_rcnn_inception_v2_coco/nuclio) | TensorFlow | 检测 |

启用自动标注，需在部署中加入 serverless 组件：

```bash
docker compose -f docker-compose.yml -f components/serverless/docker-compose.serverless.yml up -d
```

随后安装 `nuctl` 并部署所需的函数（如 SAM 或 YOLO），即可在 CVAT 的“模型”页面使用。

## 支持

- **使用问题**：在 [Discord](https://discord.com/invite/fNR3eXfk6C) 提问，或在 Stack Overflow 使用 `cvat` 标签。
- **缺陷与功能请求**：使用本仓库的 [GitHub Issues](https://github.com/kangzyz/cvat/issues)。
- **常见问题**：见登录后内置中文指南中的“常见问题”章节。

## 贡献

欢迎各种形式的贡献：缺陷报告、文档修订、集成与代码。

- 缺陷报告或功能请求请使用 [GitHub Issues](https://github.com/kangzyz/cvat/issues)。
- 提交代码前请确保通过相应的 lint 与构建检查。

## 安全

- 报告漏洞前请先了解上游的 [安全策略](https://github.com/cvat-ai/cvat/security/policy)。
- 涉及敏感问题，请通过仓库 Issues 私下联系维护者。

## 许可证

社区版基于 MIT 许可证发布。

- `/serverless` 目录中的代码同样采用 MIT 许可证，但可能使用受独立许可证（包括非商业许可证）约束的第三方资源，
  使用前请先审阅相应许可证。
- 本软件使用受 LGPL/GPL 约束的 FFmpeg 库，详见 Dockerfile 与
  [FFmpeg 法律信息](https://www.ffmpeg.org/legal.html)。

## 致谢与来源

本仓库 fork 自上游开源项目 [CVAT](https://github.com/cvat-ai/cvat)，在其基础上进行简体中文本地化与社区版适配改造。
感谢原作者及社区的卓越工作。

- **上游仓库**：https://github.com/cvat-ai/cvat
- **原项目官网**：https://www.cvat.ai/
- **许可证**：本项目与上游同样基于 [MIT License](https://github.com/kangzyz/cvat/blob/develop/LICENSE) 发布。
- **版权**：原始代码版权归 CVAT.ai Corporation 及 Intel Corporation 等原始贡献者所有，相关版权与许可声明已按
  MIT 协议要求予以保留；本仓库的修改部分版权归各自贡献者所有。

依据 MIT 许可证，你可以自由使用、复制、修改、合并、发布、分发本软件，但须在软件的所有副本或重要部分中保留
上述版权声明与许可声明。

  <!-- Badges -->

[release-img]: https://img.shields.io/github/v/release/kangzyz/cvat?style=flat-square
[release-url]: https://github.com/kangzyz/cvat/releases

[license-img]: https://img.shields.io/github/license/kangzyz/cvat?style=flat-square
[license-url]: https://github.com/kangzyz/cvat/blob/develop/LICENSE

[stars-img]: https://img.shields.io/github/stars/kangzyz/cvat?style=flat-square
[stars-url]: https://github.com/kangzyz/cvat/stargazers

[discord-img]: https://img.shields.io/discord/1000789942802337834?label=discord
[discord-url]: https://discord.gg/fNR3eXfk6C
