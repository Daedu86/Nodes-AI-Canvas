const legacyOriginalBlock = `  async handleSend(message) {
    const text = getThreadMessageText(message);
    if (text !== this._previousText) {
      this.runtime.append({
        ...message,
        content: [...message.content, ...this._nonTextParts],
        parentId: this._parentId,
        sourceId: this._sourceId
      });
    }
    this.handleCancel();
  }`;

const legacyPatchedBlock = `  async handleSend(message) {
    const text = getThreadMessageText(message);
    const metadata = message.metadata ?? {};
    const custom = metadata.custom ?? {};
    const bridgeMetadata = {
      ...metadata,
      custom: {
        ...custom,
        __assistantEditParentId: this._parentId ?? null,
        __assistantEditSourceId: this._sourceId ?? null
      }
    };
    const bridgedMessage = {
      ...message,
      metadata: bridgeMetadata
    };
    this.runtime.append({
      ...bridgedMessage,
      content: [...message.content, ...this._nonTextParts],
      parentId: this._parentId,
      sourceId: this._sourceId,
      startRun: true
    });
    return this.handleCancel();
  }`;

const currentOriginalBlock = `    async handleSend(message) {
        const text = getThreadMessageText(message);
        if (text !== this._previousText) {
            this.runtime.append({
                ...message,
                content: [...message.content, ...this._nonTextParts],
                parentId: this._parentId,
                sourceId: this._sourceId,
            });
        }
        this.handleCancel();
    }`;

const currentPatchedBlock = `    async handleSend(message) {
        const text = getThreadMessageText(message);
        const metadata = message.metadata ?? {};
        const custom = metadata.custom ?? {};
        const bridgeMetadata = {
            ...metadata,
            custom: {
                ...custom,
                __assistantEditParentId: this._parentId ?? null,
                __assistantEditSourceId: this._sourceId ?? null,
            },
        };
        const bridgedMessage = {
            ...message,
            metadata: bridgeMetadata,
        };
        if (text !== this._previousText) {
            this.runtime.append({
                ...bridgedMessage,
                content: [...message.content, ...this._nonTextParts],
                parentId: this._parentId,
                sourceId: this._sourceId,
                startRun: true,
            });
        }
        return this.handleCancel();
    }`;

const oldPatchedBlock = `  async handleSend(message) {
    const text = getThreadMessageText(message);
    console.log("Mensaje enviado desde composer:", message);
    const metadata = message.metadata ?? {};
    const custom = metadata.custom ?? {};
    const bridgeMetadata = {
      ...metadata,
      custom: {
        ...custom,
        __assistantEditParentId: this._parentId ?? null,
        __assistantEditSourceId: this._sourceId ?? null
      }
    };
    const bridgedMessage = {
      ...message,
      metadata: bridgeMetadata
    };
    if (process.env.NODE_ENV !== "production") {
      console.log("[edit-composer] bridge payload", {
        parentId: this._parentId,
        sourceId: this._sourceId,
        metadata: bridgeMetadata
      });
    }
    this.runtime.append({
      ...bridgedMessage,
      content: [...message.content, ...this._nonTextParts],
      parentId: this._parentId,
      sourceId: this._sourceId,
      startRun: true
    });
    return this.handleCancel();
  }`;

function applyAssistantUiPatch(source) {
  if (source.includes(legacyPatchedBlock) || source.includes(currentPatchedBlock)) {
    return { status: "already-applied", nextSource: source };
  }

  if (source.includes(oldPatchedBlock)) {
    return {
      status: "updated-existing-patch",
      nextSource: source.replace(oldPatchedBlock, legacyPatchedBlock),
    };
  }

  if (source.includes(legacyOriginalBlock)) {
    return {
      status: "patched",
      nextSource: source.replace(legacyOriginalBlock, legacyPatchedBlock),
    };
  }

  if (source.includes(currentOriginalBlock)) {
    return {
      status: "patched",
      nextSource: source.replace(currentOriginalBlock, currentPatchedBlock),
    };
  }

  return { status: "missing-source-block", nextSource: source };
}

module.exports = {
  applyAssistantUiPatch,
  oldPatchedBlock,
  legacyOriginalBlock,
  legacyPatchedBlock,
  currentOriginalBlock,
  currentPatchedBlock,
};
