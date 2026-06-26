# 安装部署（社区自托管）

CVAT 社区版通过 Docker Compose 在本地或私有服务器上部署。以下为各平台的安装步骤。

## 环境要求

- 64 位操作系统：Ubuntu / Debian、Windows 10/11、macOS。
- 已安装 **Docker Engine** 与 **Docker Compose 插件**。
- 建议至少 4 核 CPU、8 GB 内存与 30 GB 可用磁盘空间。

## Ubuntu / Linux

```bash
# 安装依赖
sudo apt-get update
sudo apt-get --no-install-recommends install -y git curl

# 获取源码
git clone https://github.com/kangzyz/cvat.git
cd cvat

# 启动 CVAT
export CVAT_HOST=localhost
docker compose up -d
```

启动完成后，在浏览器访问 `http://localhost:8080`。

## Windows 10/11

1. 安装 [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)，
   并在设置中启用 WSL 2 后端。
2. 安装 Git for Windows。
3. 在 PowerShell 或 Git Bash 中执行：

```bash
git clone https://github.com/kangzyz/cvat.git
cd cvat
docker compose up -d
```

## macOS

1. 安装 [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)。
2. 安装 Git（可通过 Homebrew：`brew install git`）。
3. 同样执行 `git clone` 与 `docker compose up -d`。

## 创建管理员账号

首次部署后需创建超级用户：

```bash
docker exec -it cvat_server bash -ic 'python3 ~/manage.py createsuperuser'
```

按提示输入用户名、邮箱与密码即可。该账号可访问 Django 管理后台（`/admin`）。

## 修改访问主机名或端口

通过环境变量设置对外主机名：

```bash
export CVAT_HOST=<你的主机名或IP>
docker compose up -d
```

如需修改 Web 端口，编辑 `docker-compose.yml` 中 `traefik` 服务的 `ports` 配置。

## 配置共享存储目录

可将宿主机目录挂载为 CVAT 共享目录，从而在创建任务时直接选择服务器上的文件。
在 `docker-compose.override.yml` 中为相关服务挂载 `cvat_share` 卷，并将其指向宿主机目录。

## 停止与升级

```bash
# 停止服务
docker compose down

# 升级前请先备份所有数据卷，再拉取最新代码后重新构建
git pull
docker compose pull
docker compose up -d
```

> 升级前务必备份 `cvat_db`、`cvat_data` 等数据卷，避免数据丢失。
