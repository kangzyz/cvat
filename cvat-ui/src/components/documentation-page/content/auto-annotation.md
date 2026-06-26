# 自动标注

自动标注使用深度学习模型对数据进行预标注，标注员只需在此基础上修正，可大幅减少工作量。
社区版可通过 **Nuclio 无服务器函数** 在本地部署模型（如 YOLO），无需依赖任何商业云服务。

## 部署本地模型服务（Nuclio）

1. 安装 [Nuclio CLI（nuctl）](https://github.com/nuclio/nuclio/releases)。
2. 使用带 serverless 组件的配置启动 CVAT：

```bash
docker compose -f docker-compose.yml -f components/serverless/docker-compose.serverless.yml up -d
```

3. 部署内置模型函数，例如 YOLO 检测器：

```bash
./serverless/deploy_cpu.sh serverless/onnx/WongKinYiu/yolov7/nuclio
```

部署成功后，模型会出现在顶部导航的 **模型（Models）** 页面。

## 使用本地 YOLO 进行自动标注

本仓库已为社区自托管场景启用本地 YOLO 部署。完成模型部署后：

1. 进入任务详情页，打开操作菜单中的 **自动标注（Automatic annotation）**。
2. 在弹窗中选择已部署的 YOLO 模型。
3. **映射标签**：将模型输出类别映射到任务中的标签（如模型的 `person` → 任务的 `行人`）。
4. 可勾选「清除已有标注」决定是否覆盖。
5. 点击 **标注（Annotate）** 启动，进度可在 **请求（Requests）** 页面查看。
6. 完成后进入作业，对预标注结果进行人工核对与修正。

## 交互式智能工具

在标注编辑器的控制栏中，还提供基于模型的交互式工具：

- **智能勾边 / 分割**：点击对象即可生成多边形或蒙版。
- **跟踪器**：在视频中自动跟踪选定对象到后续帧。

这些工具同样依赖已部署的本地模型函数。

## 常见问题

- **模型未出现在 Models 页面**：确认 Nuclio 函数部署成功（`nuctl get functions`），且 CVAT 以 serverless 配置启动。
- **标注结果为空**：检查标签映射是否正确，以及输入图像是否符合模型预期尺寸。
- **性能不足**：CPU 推理较慢，建议为模型函数配置 GPU（使用 `deploy_gpu.sh`）。
