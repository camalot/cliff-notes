#!/usr/bin/bash
set -e

echo "::group::PREPARE: Setting up environment variables for Docker build"

######
# OUTPUTS:
#   pr_comment_marker: text to identify the PR comment
#   docker_tags_comment: file path to comment content
######

# if has --release flag, then set the image tag to latest, otherwise set it to beta
PREP_RELEASE_FLAG=false
PREP_TAGS=()
PR_COMMENT_MARKER="<!-- docker-build-tags -->"
# SHIFT the --release flag out of the way for future arg parsing
while [[ "$1" == --* ]]; do
  case "$1" in
    --release)
      PREP_RELEASE_FLAG=true
      shift
      ;;
    --beta)
      PREP_RELEASE_FLAG=false
      shift
      ;;
    --tags=*)
      IFS=',' read -ra temp_tags <<< "${1#--tags=}"
      PREP_TAGS+=("${temp_tags[@]}")
      shift
      ;;
    --tags)
      IFS=',' read -ra temp_tags <<< "$2"
      PREP_TAGS+=("${temp_tags[@]}")
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

if [[ -z "${GH_IMAGE_REGISTRY}" ]]; then
  echo "GH_IMAGE_REGISTRY is not set. Please set it to the GitHub image registry."
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
  GHCR_IMAGE="${GH_IMAGE_REGISTRY}/${GH_ORG}/${IMAGE_ORG}/${IMAGE_NAME}"
else
  GHCR_IMAGE="${GH_IMAGE_REGISTRY}/${GH_ORG}/${IMAGE_ORG}/${GH_ACTOR}/${IMAGE_NAME}"
fi

BUILD_DATEZ="$(date +'%Y-%m-%dT%TZ%z' -u)"
# get the short sha for the tag
GH_SHA="$(echo "${GITHUB_SHA}" | cut -c1-7)"

TAGZ=""
# loop PREP_TAGS and add them to the tag string
# if --release flag is set, then ensure 'latest' tag is included, otherwise ensure 'beta' tag is included
if [[ "${PREP_RELEASE_FLAG}" == true ]]; then
  if [[ ! " ${PREP_TAGS[*]} " =~ " latest " ]]; then
    PREP_TAGS+=("latest")
  fi
else
  if [[ ! " ${PREP_TAGS[*]} " =~ " beta " ]]; then
    PREP_TAGS+=("beta" "beta-${GH_SHA}")
  fi
fi
for tag in "${PREP_TAGS[@]}"; do
  entry="${GHCR_IMAGE}:${tag}"
  TAGZ="${TAGZ:+${TAGZ},}${entry}"
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

echo "docker_tags_comment=/tmp/docker-tags-comment.md" >> "$GITHUB_OUTPUT"

# summary output
{
  echo "## Docker Build Preparation Summary"
  echo "| Variable | Value |"
  echo "| --- | --- |"
  echo "| GHCR_IMAGE | \`${GHCR_IMAGE}\` |"
  echo "| PREP_RELEASE_FLAG | \`${PREP_RELEASE_FLAG}\` |"
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
