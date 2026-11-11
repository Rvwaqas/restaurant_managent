#!/bin/sh
# ==============================================================================
# Restaurant POS - Server Supervisor & Lifecycle Manager
# Handles background daemonization, exponential backoff, crash-loop guard,
# and write status file run/status.json.
# ==============================================================================

set -u

POS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="${POS_ROOT}/run"
LOG_DIR="${POS_ROOT}/data/logs"
PID_FILE="${RUN_DIR}/server.pid"
STATUS_FILE="${RUN_DIR}/status.json"
SUPERVISOR_PID_FILE="${RUN_DIR}/supervisor.pid"
CRASHES_LOG="${RUN_DIR}/crashes.log"
LOG_FILE="${LOG_DIR}/server.log"

mkdir -p "${RUN_DIR}" "${LOG_DIR}"

MAX_CRASHES=10
CRASH_WINDOW_SECONDS=300

get_backoff() {
    case "$1" in
        0) echo 1 ;;
        1) echo 2 ;;
        2) echo 5 ;;
        3) echo 10 ;;
        *) echo 30 ;;
    esac
}

acquire_wake_lock() {
    if command -v termux-wake-lock >/dev/null 2>&1; then
        termux-wake-lock || true
    fi
}

release_wake_lock() {
    if command -v termux-wake-unlock >/dev/null 2>&1; then
        termux-wake-unlock || true
    fi
}

update_status() {
    status_state="$1"
    status_pid="${2:-0}"
    status_restarts="${3:-0}"
    status_exit_code="${4:-0}"
    status_now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

    cat << EOF > "${STATUS_FILE}"
{
  "state": "${status_state}",
  "pid": ${status_pid},
  "restarts": ${status_restarts},
  "last_exit_code": ${status_exit_code},
  "updated_at": "${status_now}"
}
EOF
}

is_running() {
    check_file="$1"
    if [ -f "$check_file" ]; then
        check_pid=$(cat "$check_file" 2>/dev/null || echo "")
        if [ -n "$check_pid" ] && kill -0 "$check_pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

start_supervisor() {
    if is_running "${SUPERVISOR_PID_FILE}"; then
        echo "Supervisor is already running with PID $(cat "${SUPERVISOR_PID_FILE}")."
        exit 0
    fi

    echo "Starting Restaurant POS supervisor..."
    acquire_wake_lock

    # Fork supervisor into background
    (
        echo $$ > "${SUPERVISOR_PID_FILE}"
        rm -f "${CRASHES_LOG}"
        restart_count=0
        backoff_idx=0

        while true; do
            update_status "starting" 0 "$restart_count" 0
            
            # Locate python executable
            PY_BIN="python3"
            if [ -x "${POS_ROOT}/venv/bin/python3" ]; then
                PY_BIN="${POS_ROOT}/venv/bin/python3"
            elif [ -x "${POS_ROOT}/venv/bin/python" ]; then
                PY_BIN="${POS_ROOT}/venv/bin/python"
            elif command -v python3 >/dev/null 2>&1; then
                PY_BIN="python3"
            elif command -v python >/dev/null 2>&1; then
                PY_BIN="python"
            fi

            # Set environment variables from config/.env if available
            if [ -f "${POS_ROOT}/config/.env" ]; then
                set -a
                # shellcheck source=/dev/null
                . "${POS_ROOT}/config/.env" 2>/dev/null || true
                set +a
            fi

            cd "${POS_ROOT}" || exit 1
            export PYTHONPATH="${POS_ROOT}/backend:${POS_ROOT}:${PYTHONPATH:-}"

            # Launch server process
            $PY_BIN -m app.serve >> "${LOG_FILE}" 2>&1 &
            SERVER_PID=$!
            echo "$SERVER_PID" > "${PID_FILE}"
            update_status "running" "$SERVER_PID" "$restart_count" 0

            # Wait for server exit
            wait "$SERVER_PID"
            EXIT_CODE=$?
            rm -f "${PID_FILE}"

            now_ts=$(date +%s 2>/dev/null || date -u +%s)
            echo "$now_ts" >> "${CRASHES_LOG}"

            # Prune crash timestamps older than CRASH_WINDOW_SECONDS
            cutoff=$((now_ts - CRASH_WINDOW_SECONDS))
            if [ -f "${CRASHES_LOG}" ]; then
                awk -v c="$cutoff" '$1 > c' "${CRASHES_LOG}" > "${CRASHES_LOG}.tmp" 2>/dev/null && mv "${CRASHES_LOG}.tmp" "${CRASHES_LOG}"
                recent_crashes=$(wc -l < "${CRASHES_LOG}" | tr -d ' ')
            else
                recent_crashes=1
            fi

            if [ "$recent_crashes" -ge "$MAX_CRASHES" ]; then
                echo "CRASH-LOOP DETECTED: ${recent_crashes} crashes within ${CRASH_WINDOW_SECONDS}s. Stopping." >> "${LOG_FILE}"
                update_status "crashed" 0 "$restart_count" "$EXIT_CODE"
                rm -f "${SUPERVISOR_PID_FILE}"
                release_wake_lock
                exit 1
            fi

            sleep_time=$(get_backoff "$backoff_idx")
            if [ "$backoff_idx" -lt 4 ]; then
                backoff_idx=$((backoff_idx + 1))
            fi

            restart_count=$((restart_count + 1))
            update_status "restarting" 0 "$restart_count" "$EXIT_CODE"
            echo "Server exited with code ${EXIT_CODE}. Restarting in ${sleep_time}s (restart #${restart_count})..." >> "${LOG_FILE}"
            sleep "$sleep_time"
        done
    ) >> "${LOG_DIR}/supervisor.log" 2>&1 &

    sleep 1
    if is_running "${SUPERVISOR_PID_FILE}"; then
        echo "Supervisor started successfully (PID $(cat "${SUPERVISOR_PID_FILE}"))."
    else
        echo "Failed to start supervisor. Check ${LOG_DIR}/supervisor.log."
        exit 1
    fi
}

stop_supervisor() {
    echo "Stopping Restaurant POS supervisor and server..."
    if [ -f "${SUPERVISOR_PID_FILE}" ]; then
        SUP_PID=$(cat "${SUPERVISOR_PID_FILE}" 2>/dev/null || echo "")
        if [ -n "$SUP_PID" ]; then
            kill "$SUP_PID" 2>/dev/null || true
        fi
        rm -f "${SUPERVISOR_PID_FILE}"
    fi

    if [ -f "${PID_FILE}" ]; then
        SRV_PID=$(cat "${PID_FILE}" 2>/dev/null || echo "")
        if [ -n "$SRV_PID" ]; then
            kill "$SRV_PID" 2>/dev/null || true
            sleep 1
            kill -9 "$SRV_PID" 2>/dev/null || true
        fi
        rm -f "${PID_FILE}"
    fi

    release_wake_lock
    update_status "stopped" 0 0 0
    echo "Stopped."
}

show_status() {
    if [ -f "${STATUS_FILE}" ]; then
        cat "${STATUS_FILE}"
        echo ""
    else
        echo '{"state": "stopped"}'
    fi
}

case "${1:-status}" in
    start)
        start_supervisor
        ;;
    stop)
        stop_supervisor
        ;;
    restart)
        stop_supervisor
        sleep 2
        start_supervisor
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
