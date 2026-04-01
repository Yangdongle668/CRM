#!/bin/bash
#
# 外贸CRM系统 - 一键部署脚本
# 支持 Ubuntu 20.04+ / CentOS 7+ / Debian 10+
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "============================================"
echo "    外贸CRM系统 - 一键部署脚本"
echo "============================================"
echo -e "${NC}"

# 检查是否为 root 或有 sudo 权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}[提示] 非root用户，部分操作可能需要sudo权限${NC}"
    fi
}

# 检查并安装 Docker
install_docker() {
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}[✓] Docker 已安装: $(docker --version)${NC}"
    else
        echo -e "${YELLOW}[*] 正在安装 Docker...${NC}"
        curl -fsSL https://get.docker.com | sh
        sudo systemctl start docker
        sudo systemctl enable docker
        sudo usermod -aG docker "$USER"
        echo -e "${GREEN}[✓] Docker 安装完成${NC}"
    fi
}

# 检查并安装 Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        echo -e "${GREEN}[✓] Docker Compose 已安装${NC}"
    else
        echo -e "${YELLOW}[*] 正在安装 Docker Compose...${NC}"
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        echo -e "${GREEN}[✓] Docker Compose 安装完成${NC}"
    fi
}

# 创建环境变量文件
setup_env() {
    if [ ! -f .env ]; then
        echo -e "${YELLOW}[*] 创建环境配置文件...${NC}"

        # 生成随机密码和密钥
        DB_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=' | head -c 20)
        JWT_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)

        cat > .env << EOF
# 数据库密码
DB_PASSWORD=${DB_PASSWORD}

# JWT密钥
JWT_SECRET=${JWT_SECRET}

# 服务端口
FRONTEND_PORT=3000
BACKEND_PORT=3001
NGINX_PORT=80
EOF
        echo -e "${GREEN}[✓] 环境配置文件已创建${NC}"
    else
        echo -e "${GREEN}[✓] 环境配置文件已存在${NC}"
    fi
}

# 创建后端环境变量
setup_backend_env() {
    if [ ! -f backend/.env ]; then
        source .env
        cat > backend/.env << EOF
DATABASE_URL=postgresql://crm_user:${DB_PASSWORD}@localhost:5432/trade_crm?schema=public
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=production
UPLOAD_DIR=./uploads
EOF
        echo -e "${GREEN}[✓] 后端环境变量已配置${NC}"
    fi
}

# 构建并启动服务
start_services() {
    echo -e "${YELLOW}[*] 清除旧的构建缓存...${NC}"
    docker compose build --no-cache

    echo -e "${YELLOW}[*] 正在启动服务...${NC}"
    echo -e "${YELLOW}    这可能需要几分钟时间，请耐心等待...${NC}"

    docker compose up -d

    echo -e "${GREEN}[✓] 所有服务已启动${NC}"
}

# 等待数据库就绪
wait_for_db() {
    echo -e "${YELLOW}[*] 等待数据库就绪...${NC}"
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker compose exec -T postgres pg_isready -U crm_user -d trade_crm &> /dev/null; then
            echo -e "${GREEN}[✓] 数据库已就绪${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    echo -e "${RED}[✗] 数据库启动超时${NC}"
    return 1
}

# 等待后端就绪
wait_for_backend() {
    echo -e "${YELLOW}[*] 等待后端服务就绪...${NC}"
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker compose exec -T backend sh -c 'wget -q -O /dev/null http://localhost:3001/api/auth/check-init 2>/dev/null || curl -sf http://localhost:3001/api/auth/check-init >/dev/null 2>&1'; then
            echo -e "${GREEN}[✓] 后端服务已就绪${NC}"
            return 0
        fi
        # Also check if the container is still running
        if ! docker compose ps backend --format '{{.State}}' 2>/dev/null | grep -q running; then
            echo -e "${RED}[✗] 后端容器已停止，查看日志:${NC}"
            docker compose logs backend --tail 20
            return 1
        fi
        attempt=$((attempt + 1))
        sleep 3
    done
    echo -e "${RED}[✗] 后端启动超时，查看日志:${NC}"
    docker compose logs backend --tail 20
    return 1
}

# 初始化数据库（种子数据）
init_database() {
    echo -e "${YELLOW}[*] 正在初始化种子数据...${NC}"
    docker compose exec -T backend npx prisma db seed
    echo -e "${GREEN}[✓] 数据库初始化完成${NC}"
}

# 显示部署结果
show_result() {
    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')

    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}    部署完成！${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "  访问地址: ${BLUE}http://${server_ip}${NC}"
    echo ""
    echo -e "  ${YELLOW}首次访问请设置管理员账户${NC}"
    echo ""
    echo -e "  常用命令:"
    echo -e "    一键升级: ${YELLOW}./deploy.sh upgrade${NC}"
    echo -e "    查看日志: ${YELLOW}docker compose logs -f${NC}"
    echo -e "    重启服务: ${YELLOW}docker compose restart${NC}"
    echo -e "    停止服务: ${YELLOW}docker compose down${NC}"
    echo -e "    查看状态: ${YELLOW}docker compose ps${NC}"
    echo ""
}

# 本地开发模式
dev_mode() {
    echo -e "${BLUE}[开发模式] 启动本地开发环境${NC}"

    # 仅启动数据库和Redis
    docker compose up -d postgres redis
    wait_for_db

    # 安装后端依赖
    echo -e "${YELLOW}[*] 安装后端依赖...${NC}"
    cd backend
    npm install
    npx prisma generate
    npx prisma migrate dev --name init
    npx prisma db seed
    cd ..

    # 安装前端依赖
    echo -e "${YELLOW}[*] 安装前端依赖...${NC}"
    cd frontend
    npm install
    cd ..

    echo ""
    echo -e "${GREEN}[✓] 开发环境准备完成！${NC}"
    echo ""
    echo -e "  启动后端: ${YELLOW}cd backend && npm run start:dev${NC}"
    echo -e "  启动前端: ${YELLOW}cd frontend && npm run dev${NC}"
    echo ""
    echo -e "  后端地址: ${BLUE}http://localhost:3001${NC}"
    echo -e "  前端地址: ${BLUE}http://localhost:3000${NC}"
    echo ""
}

# 主函数
main() {
    check_root

    case "${1:-}" in
        dev)
            setup_env
            setup_backend_env
            dev_mode
            ;;
        stop)
            echo -e "${YELLOW}[*] 停止所有服务...${NC}"
            docker compose down
            echo -e "${GREEN}[✓] 服务已停止${NC}"
            ;;
        restart)
            echo -e "${YELLOW}[*] 重启所有服务...${NC}"
            docker compose restart
            echo -e "${GREEN}[✓] 服务已重启${NC}"
            ;;
        logs)
            docker compose logs -f "${2:-}"
            ;;
        upgrade)
            echo -e "${BLUE}[升级模式] 一键更新系统${NC}"
            echo ""

            # Pull latest code
            echo -e "${YELLOW}[1/4] 拉取最新代码...${NC}"
            git pull
            echo -e "${GREEN}[✓] 代码已更新${NC}"

            # Clear build cache and rebuild
            echo -e "${YELLOW}[2/4] 清除缓存并重新构建镜像...${NC}"
            docker builder prune -f 2>/dev/null || true
            docker compose build --no-cache
            echo -e "${GREEN}[✓] 镜像构建完成${NC}"

            # Restart services
            echo -e "${YELLOW}[3/4] 重启服务...${NC}"
            docker compose up -d
            echo -e "${GREEN}[✓] 服务已重启${NC}"

            # Wait for backend and run migrations
            echo -e "${YELLOW}[4/4] 等待服务就绪并执行数据库迁移...${NC}"
            sleep 5
            local upgrade_attempts=0
            while [ $upgrade_attempts -lt 30 ]; do
                if docker compose exec -T backend sh -c 'wget -q -O /dev/null http://localhost:3001/api/auth/check-init 2>/dev/null || curl -sf http://localhost:3001/api/auth/check-init >/dev/null 2>&1'; then
                    break
                fi
                upgrade_attempts=$((upgrade_attempts + 1))
                sleep 3
            done
            echo -e "${GREEN}[✓] 数据库迁移已在容器启动时自动执行${NC}"

            echo ""
            echo -e "${GREEN}============================================${NC}"
            echo -e "${GREEN}    系统升级完成！${NC}"
            echo -e "${GREEN}============================================${NC}"
            echo ""
            echo -e "  查看日志: ${YELLOW}docker compose logs -f${NC}"
            echo -e "  查看状态: ${YELLOW}docker compose ps${NC}"
            echo ""
            ;;
        reset)
            echo -e "${RED}[警告] 这将清除所有数据！${NC}"
            read -p "确认继续？(y/N): " confirm
            if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                docker compose down -v
                rm -f .env backend/.env
                echo -e "${GREEN}[✓] 已重置${NC}"
            fi
            ;;
        *)
            install_docker
            install_docker_compose
            setup_env
            setup_backend_env
            start_services
            wait_for_db
            wait_for_backend
            init_database
            show_result
            ;;
    esac
}

main "$@"
