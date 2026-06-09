#!/bin/bash
set -Eeuo pipefail

print_header() {
    local title="$1"
    local width=60
    local title_length=${#title}
    local padding=$(( (width - title_length - 2) / 2 ))

    echo ""
    printf "%${width}s\n" | tr ' ' '='
    printf "%${padding}s%s%${padding}s\n" "" "${title}" ""
    printf "%${width}s\n" | tr ' ' '='
    echo ""
}

check_command_availability() {
  if ! command -v "$1" &> /dev/null; then
	  echo "❌ '$1' is required but not installed"
    if [[ -n "${2:-}" ]]; then
        echo "To install: ${2:-}"
    fi
	  exit 1
  fi
  echo "✅ $1 command available"
}

assert_minimal_node_version() {
    local min_version=$1
    local current_version
    current_version=$(node -v | sed 's/v//' | cut -d'.' -f1)

    if [[ "${current_version}" -lt "${min_version}" ]]; then
        echo "Error: Node.js version ${min_version} or higher is required. Found version: ${current_version}"
        exit 1
    fi
    echo "✅ Node ${current_version} found"
}

check_python_version() {
    local min_version=$1
    local current_version
    local current_major_minor
    current_version=$(python --version 2>&1 | cut -d' ' -f2)
    current_major_minor=$(echo "${current_version}" | cut -d'.' -f1-2)

    # Very ugly, but we can't rely on the macOS (BSD) sort command to reliably compare version numbers, so we do it in Python.
    if ! python -c 'import sys; min_v = tuple(map(int, sys.argv[1].split("."))); cur_v = tuple(map(int, sys.argv[2].split("."))); sys.exit(0 if cur_v >= min_v else 1)' "${min_version}" "${current_major_minor}"; then
        echo "Error: Python version ${min_version} or higher is required. Found version: ${current_version}"
        exit 1
    fi
    echo "✅ Python ${current_version} found"
}

check_docker_running() {
    if ! docker info &> /dev/null; then
        echo "Error: Docker is not running or not accessible."
        exit 1
    fi
    echo "✅ Docker is running"
}

check_gdal_installed() {
    # Separate function from check_command_availability to not confuse gdalinfo with GDAL in general.
    if ! command -v gdalinfo &> /dev/null; then
        echo "Error: GDAL is not installed."
        echo "Please install GDAL using Homebrew:"
        echo "  brew install gdal"
        exit 1
    fi
    echo "✅ GDAL is installed"
}

# Check if we've received an argument for the target directory
if [[ "$#" -ne 1 ]]; then
    echo "Usage: $0 <target_directory>"
    exit 1
fi

print_header "Checking/creating target directory"
TARGET_DIR="$1"
echo "Target directory: ${TARGET_DIR}"
if [[ -d "${TARGET_DIR}" ]]; then
    dir_contents=$(ls -A "${TARGET_DIR}")
    if [[ -n "${dir_contents}" ]]; then
        echo "Error: Directory '${TARGET_DIR}' is not empty. Please choose an empty directory or remove its contents."
        exit 1
    fi
else
    echo "Directory '${TARGET_DIR}' does not exist. It will be created."
    mkdir -p "${TARGET_DIR}"
fi
# Save full path of the target directory
TARGET_DIR=$(realpath "$1")

print_header "Checking System Requirements"

check_command_availability "git"
check_command_availability "curl"

# Node stuff
check_command_availability "node"
assert_minimal_node_version "22"
check_command_availability "pnpm" "brew install pnpm"

# Python stuff
check_command_availability "python"
check_python_version 3.12
check_command_availability "uv" "https://docs.astral.sh/uv/getting-started/installation/"

# Docker stuff
check_command_availability "docker"
check_docker_running

check_gdal_installed

cd "${TARGET_DIR}"

print_header "Cloning Repositories"
git clone git@github.com:rodekruis/IBF.git
git clone git@github.com:rodekruis/go-web-app.git
git clone git@github.com:rodekruis/IBF-seed-data.git


print_header "Backend"
cd IBF
cp services/.env.example services/.env
npm install
cd "${TARGET_DIR}"

print_header "Frontend"
cd go-web-app
git submodule update --init --remote
pnpm install
cp app/sample.env app/.env
cd "${TARGET_DIR}"

print_header "Pipelines"
cd IBF/data
./uv-sync.sh
cp .env.example .env
cd "${TARGET_DIR}"

print_header "Installing helper scripts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/sub_scripts/"*.sh "${TARGET_DIR}/"
chmod +x "${TARGET_DIR}/"*.sh

print_header "Done!"

echo "The IBF application has been set up in '${TARGET_DIR}'."
echo "Run 'frontend_start.sh' to start the frontend"
echo "Run 'backend_start.sh' to start the backend services"
echo "Run 'backend_reset_and_seed.sh' to reset and seed the database with mock data (make sure backend is running first)"
echo "Run 'open_urls.sh' to open the application URLs in your browser"
echo "There are some other shell scripts in that directory as well"
