'use strict';

const { createRequest } = require('../../../api/util/request.js');
const { calculateMid, generateWebGLHash, getGuid } = require('../../../api/util/util.js');
// qrcode 只安装在 api/node_modules 下，且其入口的图片渲染依赖 canvas/pngjs（RN 里不可用），
// 这里直接引用纯 JS 的编码核心生成点阵，由 UI 层（QrCodeView）自行渲染。
const { create: createQrSymbol } = require('../../../api/node_modules/qrcode/lib/core/qrcode.js');

function createQrMatrix(text) {
  const { modules } = createQrSymbol(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, data: modules.data };
}

module.exports = {
  createRequest,
  calculateMid,
  generateWebGLHash,
  getGuid,
  createQrMatrix,
};
