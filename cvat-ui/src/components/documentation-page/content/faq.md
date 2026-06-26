# 常见问题

本章汇总社区自托管部署中常见的问题与解决方法。

## 如何升级 CVAT？

升级前请先 **备份所有数据卷**（`cvat_db`、`cvat_data` 等）。随后拉取最新代码并重新构建：

```bash
git pull
docker compose pull
docker compose up -d
```

## 如何修改默认主机名或端口？

设置 `CVAT_HOST` 环境变量修改主机名：

```bash
export CVAT_HOST=<你的主机名或IP>
docker compose up -d
```

若使用 `sudo` 运行，请加 `-E` 以保留环境变量：`sudo -E docker compose up -d`。
修改 Web 端口需编辑 `docker-compose.yml` 中 `traefik` 服务的 `ports`。

## 上传的图像/视频存储在哪里？

存储在 Docker 数据卷 `cvat_data` 中（容器内路径 `/home/django/data`）。

## 标注数据存储在哪里？

标注保存在 PostgreSQL 数据库中，数据库文件位于 `cvat_db` 卷（容器内 `/var/lib/postgresql/data`）。

## 在 Windows 上如何配置共享文件夹？

先在 Docker Desktop 的「Resources → File sharing」中共享目标目录，
再在 `docker-compose.override.yml` 中将该目录挂载为 `cvat_share` 卷供各 worker 使用。

## 一个任务包含多个作业时，如何整体上传标注？

在 **任务详情页** 或 **任务列表** 中导入标注会作用于整个任务；
而在 **标注编辑器** 内导入只影响当前作业。

## 如何创建包含多个作业的任务？

在创建任务的 **高级配置** 中设置 **片段大小（Segment size）**，任务会按该大小自动拆分为多个作业。

## 如何把 CVAT 迁移到另一台机器？

备份并迁移 `cvat_db` 与 `cvat_data` 数据卷，在新机器上恢复后重新 `docker compose up -d`。

## 如何加载自己的深度学习模型？

参见 **自动标注** 一章，通过 Nuclio 部署自定义模型函数；
本仓库已为社区场景启用本地 YOLO 部署。

## 服务器使用自签名证书，如何跳过校验？

CLI 可使用 `--insecure` 参数；SDK 可在 `cvat_sdk.core.client.Config` 中设置 `ssl_verify = False`。

## 忘记管理员密码怎么办？

重新进入容器创建或重置超级用户：

```bash
docker exec -it cvat_server bash -ic 'python3 ~/manage.py changepassword <用户名>'
```
