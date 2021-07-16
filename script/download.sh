#!/bin/sh
#
# download.sh - download all listed files, require wget
#
# usage:
#  download.sh [--debug] [--outdir <output directory>] <dataList.sh>
#
#
OUTDIR="$(cd $(dirname ${0}) && pwd -P)/../download"

#
# Prep
#
initialize_download_dir() {
  DOWNLOAD_DIR="${OUTDIR}/$(date +'%Y%m%d')"
  mkdir -p "${DOWNLOAD_DIR}"
  UPDATED_FILES="${DOWNLOAD_DIR}/updated_files.txt"
  printf "file_path\tgraph_name\tfile_type\n" > "${UPDATED_FILES}"
}

#
# Download
#
get_db_name() {
  local line="${1}"
  printf "${line}\n" | cut -f 1 | sed -e 's: :_:g'
}

get_graph_name() {
  local line="${1}"
  printf "${line}\n" | cut -f 2
}

get_url() {
  local line="${1}"
  printf "${line}\n" | cut -f 3
}

download_all() {
  printf "Starting download using single thread..\n"
  IFS=$'\n'
  for line in $(awk -F'\t' 'NR != 1 && NF == 3' ${DATALIST}); do
    local db_name=$(get_db_name "${line}")
    local graph_name=$(get_graph_name "${line}")
    local url=$(get_url "${line}")

    if [[ ! -z "${url}" ]]; then
      download "${db_name}" "${graph_name}" "${url}"
    fi
  done
}

parallel_download() {
  printf "Starting parallel download using $(nproc) threads..\n"
  IFS=$'\n'
  for line in $(awk -F'\t' 'NR != 1 && NF == 3' ${DATALIST}); do
    local db_name=$(get_db_name "${line}")
    local graph_name=$(get_graph_name "${line}")
    local url=$(get_url "${line}")

    if [[ ! -z ${url} ]]; then
      download "${db_name}" "${graph_name}" "${url}" &
    fi

    [ $( jobs | wc -l ) -ge $( nproc ) ] && wait ||:
  done
  wait
}

download() {
  local db_name="${1}"
  local graph_name="${2}"
  local url="${3}"
  local db_dir=$(create_db_dir ${db_name})
  cd ${db_dir}

  printf "\n"
  printf "Start Downloading: ${db_name} at ${db_dir}\n"
  printf "  Graph name: ${graph_name}\n"

  local cmd=$(generate_wget_command "${url}")
  printf "  Command: ${cmd}\n"
  eval ${cmd} ||:
  wait

  post_download "${graph_name}" "${db_dir}"
}

create_db_dir() {
  local db_name="${1}"
  local db_dir="${DOWNLOAD_DIR}/${db_name}"
  mkdir -p "${db_dir}"
  printf "${db_dir}\n"
}

generate_wget_command() {
  local url="${1}"
  local opt=""

  if [[ ! -z "${DEBUG}" ]]; then
    local opt="${opt} --spider"
  else
    local opt="${opt} --quiet"
  fi

  if [[ ! -z $(printf "${url}\n" | awk '/\/$/') ]]; then
    local opt="${opt} -m -np -nd --accept '*.nt*','*.ttl*','*.owl*','*.tar*','*.rdf*'"
  fi

  printf "wget ${opt} '${url}'\n"
}

post_download() {
  local graph_name="${1}"
  local db_dir="${2}"

  rename_files "${db_dir}"

  if [[ -z "${RAW}" ]]; then
    remove_robotstxt "${db_dir}"
    decompress_files "${db_dir}"
  fi

  create_date_triple "${graph_name}" "${db_dir}"
  update_file_list "${graph_name}" "${db_dir}"
}

rename_files() {
  local db_dir="${1}"
  local n=0
  IFS=$'\n'
  for file in $(find "${db_dir}" -type f -name '*\?*'); do
    mv "${file}" "${db_dir}/data.${n}.rdf"
    n+=1
  done
}

remove_robotstxt() {
  local db_dir="${1}"
  cd "${db_dir}" && rm -f "robots.txt"
}

decompress_files() {
  local db_dir="${1}"
  decompress_zipfiles "${db_dir}"
  decompress_tarfiles "${db_dir}"
  decompress_gz "${db_dir}"
  decompress_xz "${db_dir}"
}

decompress_zipfiles() {
  local db_dir="${1}"
  cd ${db_dir} && find . -type f -name "*.zip" | xargs -L 1024 unzip 2>/dev/null
}

decompress_tarfiles() {
  local db_dir="${1}"
  cd ${db_dir} && find . -type f -name "*.tar*" | xargs -L 1024 tar xf 2>/dev/null
  cd ${db_dir} && find . -type f -name "*.tar*" | xargs -L 1024 rm -f
}

decompress_gz() {
  local db_dir="${1}"
  cd ${db_dir} && find . -type f -name "*.gz" | xargs -L 1024 gunzip --force 2>/dev/null
}

decompress_xz() {
  local db_dir="${1}"
  cd ${db_dir} && find . -type f -name "*.xz" | xargs -L 1024 unxz 2>/dev/null
}

update_file_list() {
  local graph_name="${1}"
  local db_dir="${2}"
  for file in $(find "${db_dir}" -type f); do
    local filetype=$(inspect_filetype "${file}")
    printf "${file}\t${graph_name}\t${filetype}\n" >> "${UPDATED_FILES}"
  done
}

inspect_filetype() {
  local file="${1}"
  case ${file} in
    *.ttl )
      echo "turtle"
      ;;
    *.rdf | *.owl )
      echo "rdfxml"
      ;;
    *.nq | *.nt )
      echo "nquads"
      ;;
    * )
      type=$(docker run -it --rm -v "${file}":/data "ghcr.io/inutano/raptor2:cc010ed" rapper --guess /data 2>/dev/null | head | awk '/Guessed/ { print $NF }' | tr -d "'")
      if [[ -z ${type} ]]; then
        echo "unknown"
      else
        echo "${type}"
      fi
      ;;
  esac
}

create_date_triple() {
  local graph_name="${1}"
  local db_dir="${2}"
  local date=$(get_modification_date "${db_dir}")
  printf "<${graph_name}> <http://purl.org/dc/terms/date> \"${date}\"^^<http://www.w3.org/2001/XMLSchema#date> .\n" > "${db_dir}/date.nq"
}

get_modification_date() {
  local db_dir="${1}"
  local oldest_file="$(get_oldest_file "${db_dir}")"
  if [[ ! -z "${oldest_file}" ]]; then
    if [[ ${OSTYPE} =~ ^darwin ]]; then
      local date_epoc=$(stat -f %m "${oldest_file}" )
      local date=$(date -r "${date_epoc}" '+%Y-%m-%d')
    else
      local date_epoc=$(stat -c '%Y' "${oldest_file}" )
      local date=$(date --date "@${date_epoc}" '+%Y-%m-%d')
    fi
  else
    local date=$(date '+%Y-%m-%d')
  fi
  printf "${date}\n"
}

get_oldest_file() {
  local db_dir="${1}"
  find "${db_dir}" -type f -printf "%T@ %p\n" | sort -n | awk 'NR == 1 { print $NF }'
}

#
# Help
#
help() {
cat <<- EOF
download.sh [--debug|--parallel|--outdir] <datalist.tsv>

options:
  --debug:    increase logging output
  --parallel: parallelize download (experimental)
  --outdir:   specify output directory
EOF
}

#
# Main
#
main() {
  if [[ ! -e ${DATALIST} ]]; then
    printf "ERROR: No data list found at ${DATALIST}\n" 1>&2
    exit 1
  fi
  initialize_download_dir
  if [[ "${PARALLEL}" = "true" ]]; then
    parallel_download
  else
    download_all
  fi
}

#
# Parse arguments and run
#
if [[ $# -eq 0 ]]; then
  help
  exit 1
else
  PARALLEL="false"
  while [[ $# -gt 0 ]]; do
    key=${1}
    case ${key} in
      -h|--help)
        help
        exit 0
        ;;
      --debug)
        set -eux
        DEBUG="true"
        ;;
      --raw)
        RAW="true"
        ;;
      --parallel)
        PARALLEL="true"
        ;;
      -O | --outdir)
        OUTDIR=$(cd "${2}" && pwd -P)
        shift
        ;;
      *tsv)
        DATALIST="${1}"
        ;;
    esac
    shift
  done
  main
fi
