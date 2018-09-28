import StageUtils from "../../tree/StageUtils.mjs";


export default class CoreRenderState {

    constructor(ctx) {
        this.ctx = ctx;

        this.stage = ctx.stage;

        this.defaultShader = new Shader(this.ctx);

        this.renderer = ctx.stage.renderer;

        this.quads = this.renderer.createCoreQuadList(ctx);

    }

    reset() {
        this._renderTextureInfo = null;

        this._scissor = null;

        /**
         * @type {Shader}
         */
        this._shader = null;

        this._shaderOwner = null;

        this._realShader = null;

        this._check = false;

        this.quadOperations = [];
        this.filterOperations = [];

        this._overrideQuadTexture = null;

        this._quadOperation = null;

        this.quads.reset();

    }

    get length() {
        return this.quads.quadTextures.length;
    }

    setShader(shader, owner) {
        if (this._shaderOwner !== owner || this._realShader !== shader) {
            // Same shader owner: active shader is also the same.
            // Prevent any shader usage to save performance.

            this._realShader = shader;

            if (shader.useDefault()) {
                // Use the default shader when possible to prevent unnecessary program changes.
                shader = this.defaultShader;
            }
            if (this._shader !== shader || this._shaderOwner !== owner) {
                this._shader = shader;
                this._shaderOwner = owner;
                this._check = true;
            }
        }
    }

    get renderTextureInfo() {
        return this._renderTextureInfo;
    }

    setScissor(area) {
        if (this._scissor !== area) {
            if (area) {
                this._scissor = area;
            } else {
                this._scissor = null;
            }
            this._check = true;
        }
    }

    getScissor() {
        return this._scissor;
    }

    setRenderTextureInfo(renderTextureInfo) {
        if (this._renderTextureInfo !== renderTextureInfo) {
            this._renderTextureInfo = renderTextureInfo;
            this._scissor = null;
            this._check = true;
        }
    }

    setOverrideQuadTexture(texture) {
        this._overrideQuadTexture = texture;
    }

    addQuad(viewCore) {
        if (!this._quadOperation) {
            this._createQuadOperation();
        } else if (this._check && this._hasChanges()) {
            this._addQuadOperation();
            this._check = false;
        }

        let nativeTexture = this._overrideQuadTexture;
        if (!nativeTexture) {
            nativeTexture = viewCore._displayedTextureSource.nativeTexture;
        }

        if (this._renderTextureInfo) {
            if (this._shader === this.defaultShader && this._renderTextureInfo.empty) {
                // The texture might be reusable under some conditions. We will check them in ViewCore.renderer.
                this._renderTextureInfo.nativeTexture = nativeTexture;
                this._renderTextureInfo.offset = this.length;
            } else {
                // It is not possible to reuse another texture when there is more than one quad.
                this._renderTextureInfo.nativeTexture = null;
            }
            this._renderTextureInfo.empty = false;
        }

        this.quads.quadTextures.push(nativeTexture);
        this.quads.quadViews.push(viewCore);

        this._quadOperation.length++;

        this.renderer.addQuad(this, this.quads, this.length - 1)
    }

    finishedRenderTexture() {
        if (this._renderTextureInfo.nativeTexture) {
            // There was only one texture drawn in this render texture.
            // Check if we can reuse it so that we can optimize out an unnecessary render texture operation.
            // (it should exactly span this render texture).
            if (!this.renderer.isRenderTextureReusable(this, this._renderTextureInfo)) {
                this._renderTextureInfo.nativeTexture = null;
            }
        }
    }

    _hasChanges() {
        let q = this._quadOperation;
        if (this._shader !== q.shader) return true;
        if (this._shaderOwner !== q.shaderOwner) return true;
        if (this._renderTextureInfo !== q.renderTextureInfo) return true;
        if (this._scissor !== q.scissor) {
            if ((this._scissor[0] !== q.scissor[0]) || (this._scissor[1] !== q.scissor[1]) || (this._scissor[2] !== q.scissor[2]) || (this._scissor[3] !== q.scissor[3])) {
                return true;
            }
        }

        return false;
    }

    _addQuadOperation(create = true) {
        if (this._quadOperation) {
            if (this._quadOperation.length || this._shader.addEmpty()) {
                if (!this._quadOperation.scissor || ((this._quadOperation.scissor[2] > 0) && (this._quadOperation.scissor[3] > 0))) {
                    // Ignore empty clipping regions.
                    this.quadOperations.push(this._quadOperation);
                }
            }

            this._quadOperation = null;
        }

        if (create) {
            this._createQuadOperation();
        }
    }

    _createQuadOperation() {
        this._quadOperation = this.renderer.createCoreQuadOperation(
            this.ctx,
            this._shader,
            this._shaderOwner,
            this._renderTextureInfo,
            this._scissor,
            this.length
        );
        this._check = false;
    }

    addFilter(filter, owner, source, target) {
        // Close current quad operation.
        this._addQuadOperation(false);

        this.filterOperations.push(this.renderer.createCoreFilterOperation(this.ctx, filter, owner, source, target, this.quadOperations.length));
    }

    finish() {
        if (this._quadOperation) {
            // Add remaining.
            this._addQuadOperation(false);
        }

        this.renderer.finishRenderState(this);
    }

}

import Shader from "../Shader.mjs";
