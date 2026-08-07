#!/usr/bin/env bash
# Travel Planner — 本地开发服务启停脚本
#
# 用法:
#   ./scripts/dev.sh start     # 启动 backend + frontend
#   ./scripts/dev.sh stop      # 停止全部
#   ./scripts/dev.sh status    # 查看状态
#   ./scripts/dev.sh restart   # 重启
#   ./scripts/dev.sh logs [backend|frontend]  # 跟踪日志（默认全部）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${ROOT_DIR}/.run"
LOG_DIR="${RUN_DIR}/logs"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"

BACKEND_PID_FILE="${RUN_DIR}/backend.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"
BACKEND_LOG="${LOG_DIR}/backend.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"

# 颜色（无 TTY 时关闭）
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_GREEN=$'\033[32m'
  C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
else
  C_RESET= C_GREEN= C_RED= C_YELLOW= C_DIM= C_BOLD=
fi

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  start      Start backend (uvicorn :${BACKEND_PORT}) and frontend (vite :${FRONTEND_PORT})
  stop       Stop all managed services
  status     Show process / port / health status
  restart    stop + start
  logs       Tail logs (optional: backend | frontend)

Environment:
  BACKEND_PORT   default ${BACKEND_PORT}
  FRONTEND_PORT  default ${FRONTEND_PORT}
EOF
}

ensure_dirs() {
  mkdir -p "${RUN_DIR}" "${LOG_DIR}"
}

is_pid_running() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

read_pid() {
  local file="$1"
  if [[ -f "${file}" ]]; then
    tr -d '[:space:]' <"${file}"
  fi
}

# 通过端口找监听 PID（优先精确匹配）
port_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
  else
    return 0
  fi
}

wait_for_port() {
  local port="$1"
  local label="$2"
  local timeout="${3:-30}"
  local i=0
  while (( i < timeout )); do
    if port_pids "${port}" | grep -q .; then
      return 0
    fi
    sleep 0.5
    i=$((i + 1))
  done
  echo "${C_YELLOW}warning:${C_RESET} ${label} did not open port ${port} within ${timeout}s" >&2
  return 1
}

http_ok() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 2 "${url}" 2>/dev/null || true)"
    [[ "${code}" == "200" ]]
  else
    return 1
  fi
}

# 杀进程及其整棵子树（兼容 uvicorn --reload / npm→vite）
kill_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  if ! is_pid_running "${pid}"; then
    return 0
  fi
  local children
  children="$(pgrep -P "${pid}" 2>/dev/null || true)"
  for c in ${children}; do
    kill_tree "${c}" "${sig}"
  done
  kill "-${sig}" "${pid}" 2>/dev/null || true
}

wait_pid_gone() {
  local pid="$1"
  local attempts="${2:-20}"
  local i=0
  while is_pid_running "${pid}" && (( i < attempts )); do
    sleep 0.25
    i=$((i + 1))
  done
  ! is_pid_running "${pid}"
}

wait_port_free() {
  local port="$1"
  local attempts="${2:-20}"
  local i=0
  while port_pids "${port}" | grep -q . && (( i < attempts )); do
    sleep 0.25
    i=$((i + 1))
  done
  ! port_pids "${port}" | grep -q .
}

stop_by_pidfile_or_port() {
  local name="$1"
  local pid_file="$2"
  local port="$3"
  local stopped=0

  local pid
  pid="$(read_pid "${pid_file}")"
  if is_pid_running "${pid}"; then
    echo "Stopping ${name} (pid ${pid})..."
    kill_tree "${pid}" TERM
    wait_pid_gone "${pid}" 20 || kill_tree "${pid}" KILL
    wait_pid_gone "${pid}" 8 || true
    stopped=1
  fi
  rm -f "${pid_file}"

  # 清理占用端口的残留（pid 文件丢失 / 外部拉起的进程）
  local leftover
  leftover="$(port_pids "${port}" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [[ -n "${leftover}" ]]; then
    echo "Stopping leftover ${name} on :${port} (pid ${leftover})..."
    for p in ${leftover}; do
      kill_tree "${p}" TERM
    done
    wait_port_free "${port}" 16 || true
    leftover="$(port_pids "${port}" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
    if [[ -n "${leftover}" ]]; then
      for p in ${leftover}; do
        kill_tree "${p}" KILL
        kill -9 "${p}" 2>/dev/null || true
      done
      wait_port_free "${port}" 8 || true
    fi
    stopped=1
  fi

  if port_pids "${port}" | grep -q .; then
    echo "${C_RED}${name}: failed to free :${port}${C_RESET}" >&2
    return 1
  fi

  if (( stopped == 0 )); then
    echo "${name}: already stopped"
  else
    echo "${C_GREEN}${name}: stopped${C_RESET}"
  fi
}

check_prereqs_backend() {
  if [[ ! -f "${ROOT_DIR}/.env" ]]; then
    echo "${C_YELLOW}warning:${C_RESET} missing ${ROOT_DIR}/.env — copy from .env.example" >&2
  fi
  if [[ ! -x "${ROOT_DIR}/backend/.venv/bin/uvicorn" ]]; then
    echo "${C_RED}error:${C_RESET} backend venv missing. Run:" >&2
    echo "  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
    return 1
  fi
}

check_prereqs_frontend() {
  if [[ ! -x "${ROOT_DIR}/frontend/node_modules/.bin/vite" ]]; then
    echo "${C_RED}error:${C_RESET} frontend deps missing. Run:" >&2
    echo "  cd frontend && npm install" >&2
    return 1
  fi
}

start_backend() {
  check_prereqs_backend

  local existing
  existing="$(port_pids "${BACKEND_PORT}")"
  if [[ -n "${existing}" ]]; then
    echo "${C_YELLOW}backend:${C_RESET} already listening on :${BACKEND_PORT} (pid ${existing//$'\n'/ })"
    echo "${existing}" | head -1 >"${BACKEND_PID_FILE}"
    return 0
  fi

  local pid
  pid="$(read_pid "${BACKEND_PID_FILE}")"
  if is_pid_running "${pid}"; then
    echo "${C_YELLOW}backend:${C_RESET} already running (pid ${pid})"
    return 0
  fi

  echo "Starting backend on http://${BACKEND_HOST}:${BACKEND_PORT} ..."
  (
    cd "${ROOT_DIR}/backend"
    # shellcheck disable=SC1091
    source .venv/bin/activate
    exec uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}"
  ) >>"${BACKEND_LOG}" 2>&1 &
  echo $! >"${BACKEND_PID_FILE}"
  wait_for_port "${BACKEND_PORT}" "backend" 40 || true
  echo "${C_GREEN}backend:${C_RESET} started (pid $(read_pid "${BACKEND_PID_FILE}")) → log ${BACKEND_LOG}"
}

start_frontend() {
  check_prereqs_frontend

  local existing
  existing="$(port_pids "${FRONTEND_PORT}")"
  if [[ -n "${existing}" ]]; then
    echo "${C_YELLOW}frontend:${C_RESET} already listening on :${FRONTEND_PORT} (pid ${existing//$'\n'/ })"
    echo "${existing}" | head -1 >"${FRONTEND_PID_FILE}"
    return 0
  fi

  local pid
  pid="$(read_pid "${FRONTEND_PID_FILE}")"
  if is_pid_running "${pid}"; then
    echo "${C_YELLOW}frontend:${C_RESET} already running (pid ${pid})"
    return 0
  fi

  echo "Starting frontend on http://${FRONTEND_HOST}:${FRONTEND_PORT} ..."
  (
    cd "${ROOT_DIR}/frontend"
    exec npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
  ) >>"${FRONTEND_LOG}" 2>&1 &
  echo $! >"${FRONTEND_PID_FILE}"
  wait_for_port "${FRONTEND_PORT}" "frontend" 40 || true
  echo "${C_GREEN}frontend:${C_RESET} started (pid $(read_pid "${FRONTEND_PID_FILE}")) → log ${FRONTEND_LOG}"
}

cmd_start() {
  ensure_dirs
  start_backend
  start_frontend
  echo
  cmd_status
}

cmd_stop() {
  ensure_dirs
  local rc=0
  stop_by_pidfile_or_port "frontend" "${FRONTEND_PID_FILE}" "${FRONTEND_PORT}" || rc=1
  stop_by_pidfile_or_port "backend" "${BACKEND_PID_FILE}" "${BACKEND_PORT}" || rc=1
  return "${rc}"
}

print_service_status() {
  local name="$1"
  local port="$2"
  local pid_file="$3"
  local health_url="${4:-}"

  local managed_pid
  managed_pid="$(read_pid "${pid_file}")"
  local listen_pids
  listen_pids="$(port_pids "${port}" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"

  local proc_state="stopped"
  local color="${C_RED}"

  if [[ -n "${listen_pids}" ]]; then
    proc_state="running"
    color="${C_GREEN}"
  elif is_pid_running "${managed_pid}"; then
    proc_state="starting?"
    color="${C_YELLOW}"
  fi

  printf "%s%-10s%s  %s%-9s%s  port=%-5s" \
    "${C_BOLD}" "${name}" "${C_RESET}" \
    "${color}" "${proc_state}" "${C_RESET}" \
    "${port}"

  if [[ -n "${listen_pids}" ]]; then
    printf "  listen_pid=%s" "${listen_pids}"
  elif [[ -n "${managed_pid}" ]]; then
    printf "  managed_pid=%s" "${managed_pid}"
  fi

  if [[ -n "${health_url}" ]]; then
    if http_ok "${health_url}"; then
      printf "  health=%sok%s" "${C_GREEN}" "${C_RESET}"
    else
      printf "  health=%sdown%s" "${C_RED}" "${C_RESET}"
    fi
  fi

  if [[ -n "${listen_pids}" ]] || is_pid_running "${managed_pid}"; then
    # HTTP 可达性（frontend 无 /health，用根路径）
    if [[ "${name}" == "frontend" ]]; then
      if http_ok "http://${FRONTEND_HOST}:${FRONTEND_PORT}/"; then
        printf "  http=%sok%s" "${C_GREEN}" "${C_RESET}"
      else
        printf "  http=%sdown%s" "${C_YELLOW}" "${C_RESET}"
      fi
    fi
  fi

  echo
}

cmd_status() {
  echo "${C_BOLD}Travel services${C_RESET}  ${C_DIM}(${ROOT_DIR})${C_RESET}"
  print_service_status "backend" "${BACKEND_PORT}" "${BACKEND_PID_FILE}" \
    "http://${BACKEND_HOST}:${BACKEND_PORT}/health"
  print_service_status "frontend" "${FRONTEND_PORT}" "${FRONTEND_PID_FILE}"
  echo
  echo "${C_DIM}URLs:${C_RESET}"
  echo "  Frontend  http://${FRONTEND_HOST}:${FRONTEND_PORT}"
  echo "  Backend   http://${BACKEND_HOST}:${BACKEND_PORT}"
  echo "  Health    http://${BACKEND_HOST}:${BACKEND_PORT}/health"
  echo "  API docs  http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
  if [[ -f "${BACKEND_LOG}" || -f "${FRONTEND_LOG}" ]]; then
    echo
    echo "${C_DIM}Logs:${C_RESET} ${LOG_DIR}/"
  fi
}

cmd_logs() {
  ensure_dirs
  local target="${1:-all}"
  case "${target}" in
    backend)
      touch "${BACKEND_LOG}"
      exec tail -n 80 -f "${BACKEND_LOG}"
      ;;
    frontend)
      touch "${FRONTEND_LOG}"
      exec tail -n 80 -f "${FRONTEND_LOG}"
      ;;
    all|*)
      touch "${BACKEND_LOG}" "${FRONTEND_LOG}"
      echo "${C_DIM}==> tail -f backend + frontend logs (Ctrl+C to stop)${C_RESET}"
      exec tail -n 40 -f "${BACKEND_LOG}" "${FRONTEND_LOG}"
      ;;
  esac
}

cmd_restart() {
  cmd_stop
  sleep 0.5
  cmd_start
}

main() {
  local cmd="${1:-}"
  shift || true
  case "${cmd}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    status)  cmd_status ;;
    restart) cmd_restart ;;
    logs)    cmd_logs "${1:-all}" ;;
    -h|--help|help|"") usage ;;
    *)
      echo "Unknown command: ${cmd}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
