#!/usr/bin/bash
set -e

echo "::group::PREPARE: Setting up environment variables for Docker build"

# if has --release flag, then set the image tag to latest, otherwise set it to beta
PREP_RELEASE_FLAG=false
PREP_VERSION="1.0.0"
PREP_TAGS=()
RELEASE_TAG="latest"
PRERELEASE_TAG="prerelease"
PREP_REGISTRIES=()
PR_COMMENT_MARKER="<!-- docker-build-tags -->"
IMAGE_ORG="${IMAGE_ORG:-}"
IMAGE_NAME="${IMAGE_NAME:-}"
# SHIFT the --release flag out of the way for future arg parsing
while [[ "$1" == --* ]]; do
  case "$1" in
    --release)
      PREP_RELEASE_FLAG=true
      shift
      ;;
    --prerelease)
      PREP_RELEASE_FLAG=false
      shift
      ;;
    --version)
      PREP_VERSION="$2"
      shift 2
      ;;
    --image-org)
      IMAGE_ORG="$2"
      shift 2
      ;;
    --image-org=*)
      IMAGE_ORG="${1#--image-org=}"
      shift
      ;;
    --image-name)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --image-name=*)
      IMAGE_NAME="${1#--image-name=}"
      shift
      ;;
    --tag=*)
      # add individual tag
      PREP_TAGS+=("${1#--tag=}")
      shift
      ;;
    --tag)
      PREP_TAGS+=("$2")
      shift 2
      ;;
    --tags=*)
      IFS=',' read -ra TMP_TAGS <<< "${1#--tags=}"
      PREP_TAGS+=("${TMP_TAGS[@]}")
      shift
      ;;
    --tags)
      IFS=',' read -ra TMP_TAGS <<< "$2"
      PREP_TAGS+=("${TMP_TAGS[@]}")
      shift 2
      ;;
    --prerelease-tag)
      PRERELEASE_TAG="${1#--prerelease-tag=}"
      shift
      ;;
    --prerelease-tag=*)
      PRERELEASE_TAG="$2"
      shift 2
      ;;
    --release-tag)
      RELEASE_TAG="${1#--release-tag=}"
      shift
      ;;
    --release-tag=*)
      RELEASE_TAG="$2"
      shift 2
      ;;
    --registries=*)
      IFS=',' read -ra TMP_REGISTRIES <<< "${1#--registries=}"
      PREP_REGISTRIES+=("${TMP_REGISTRIES[@]}")
      shift
      ;;
    --registries)
      IFS=',' read -ra TMP_REGISTRIES <<< "$2"
      PREP_REGISTRIES+=("${TMP_REGISTRIES[@]}")
      shift 2
      ;;
    --registry=*)
      PREP_REGISTRIES+=("${1#--registry=}")
      shift
      ;;
    --registry)
      PREP_REGISTRIES+=("$2")
      shift 2
      ;;
    --pr-comment-marker=*)
      PR_COMMENT_MARKER="${1#--pr-comment-marker=}"
      shift
      ;;
    --pr-comment-marker)
      PR_COMMENT_MARKER="$2"
      shift 2
      ;;
    *)
      echo "Found Unknown flag: $1" >&2
      shift
      ;;
  esac
done

if [[ -z "${IMAGE_ORG}" ]]; then
  echo "IMAGE_ORG is not set. Please set it to the organization of the image."
  exit 1
fi

if [[ -z "${IMAGE_NAME}" ]]; then
  echo "IMAGE_NAME is not set. Please set it to the name of the image."
  exit 1
fi

T_GH_ACTOR="${GH_ACTOR:-${GITHUB_ACTOR}}"
if [[ -z "${T_GH_ACTOR}" ]]; then
  echo "GITHUB_ACTOR is not set. Please set it to the GitHub actor."
  exit 1
fi
GH_ACTOR="${T_GH_ACTOR,,}"
T_GH_ORG="${GH_ORG:-${GITHUB_REPOSITORY_OWNER}}"
if [[ -z "${T_GH_ORG}" ]]; then
  echo "GITHUB_REPOSITORY_OWNER is not set. Please set it to the GitHub repository owner."
  exit 1
fi
GH_ORG="${T_GH_ORG,,}"
unset T_GH_ACTOR
unset T_GH_ORG
# lower case the container org
IMAGE_ORG="${IMAGE_ORG,,}"
# lower case the container name
IMAGE_NAME="${IMAGE_NAME,,}"

if [[ "${PREP_RELEASE_FLAG}" == true ]]; then
  REGISTRY_PATH="${IMAGE_ORG}/${IMAGE_NAME}"
else
  REGISTRY_PATH="${IMAGE_ORG}/${GH_ACTOR}/${IMAGE_NAME}"
fi

BUILD_DATEZ="$(date +'%Y-%m-%dT%TZ%z' -u)"
# get the short sha for the tag
GH_SHA="$(echo "${GITHUB_SHA}" | cut -c1-7)"

TAGZ=""
# loop PREP_TAGS and add them to the tag string
# if --release flag is set, then ensure '$RELEASE_TAG' tag is included, otherwise ensure '$PRERELEASE_TAG' tag is included
if [[ "${PREP_RELEASE_FLAG}" == true ]]; then
  release_pattern=" ${RELEASE_TAG} "
  if [[ ! " ${PREP_TAGS[*]} " =~ $release_pattern ]]; then
    PREP_TAGS+=("${RELEASE_TAG}")
  fi
else
  prerelease_pattern=" ${PRERELEASE_TAG} "
  if [[ ! " ${PREP_TAGS[*]} " =~ $prerelease_pattern ]]; then
    PREP_TAGS+=("${PRERELEASE_TAG}" "${PRERELEASE_TAG}-${GH_SHA}")
  fi
fi
for registry in "${PREP_REGISTRIES[@]}"; do
  for tag in "${PREP_TAGS[@]}"; do
    entry="${registry}/${REGISTRY_PATH}:${tag}"
    TAGZ="${TAGZ:+${TAGZ},}${entry}"
  done
done

{
  echo "BUILD_TAGS=${TAGZ}"
  echo "BUILD_DATE=${BUILD_DATEZ}"
} >> "$GITHUB_ENV"

echo "pr_comment_marker=${PR_COMMENT_MARKER}" >> "$GITHUB_OUTPUT"

# Generate PR comment markdown — repository:tag table
{
  echo "${PR_COMMENT_MARKER}"
  echo "## Docker Build Tag Summary · [Details →](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})"
  echo ""
  echo "| Repository | Tag |"
  echo "| --- | --- |"
  IFS=',' read -ra ALL_TAGS <<< "${TAGZ}"
  for full_tag in "${ALL_TAGS[@]}"; do
    repo="${full_tag%:*}"
    tag="${full_tag##*:}"
    echo "| \`${repo}\` | \`${tag}\` |"
  done
  echo ""
} > /tmp/docker-tags-comment.md

# summary output
{
  echo "## Docker Build Preparation Summary"
  echo "| Variable | Value |"
  echo "| --- | --- |"
  for registry in "${PREP_REGISTRIES[@]}"; do
    echo "| REGISTRY | \`${registry}\` |"
  done
  echo "| PREP_RELEASE_FLAG | \`${PREP_RELEASE_FLAG}\` |"
  echo "| PREP_VERSION | \`${PREP_VERSION}\` |"
  echo "| PREP_TAGS | \`${PREP_TAGS[*]}\` |"
  echo ""

  echo "### OUTPUT Environment Variables"
  echo "| Variable | Value |"
  echo "| --- | --- |"
  echo "| BUILD_DATE | \`${BUILD_DATEZ}\` |"
  echo "| BUILD_TAGS | \`${TAGZ}\` |"
  echo ""

  echo "## Docker Build Tag Summary"
  echo ""
  echo "| Repository | Tag |"
  echo "| --- | --- |"
  IFS=',' read -ra ALL_TAGS <<< "${TAGZ}"
  for full_tag in "${ALL_TAGS[@]}"; do
    repo="${full_tag%:*}"
    tag="${full_tag##*:}"
    echo "| \`${repo}\` | \`${tag}\` |"
  done
  echo ""
} >> "$GITHUB_STEP_SUMMARY"

echo "::endgroup::"
