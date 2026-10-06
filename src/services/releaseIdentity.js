// Legacy analytical feeds remain readable. Notification requires a manifest.
export function validReleaseIdentity(value) {
  return !!value && ["id", "sourceRevision", "inputsHash"].every(key => typeof value[key] === "string") &&
    /^release-[a-f0-9]{64}$/.test(value.id) &&
    /^[a-f0-9]{40}$/.test(value.sourceRevision ?? "") && /^[a-f0-9]{64}$/.test(value.inputsHash ?? "");
}
