import type { BentoErrorCode } from './errors.js';

export type BentoRpcMethod =
  | 'getCapabilities'
  | 'getSelectionContext'
  | 'applyLayoutDiff'
  | 'applyStyle'
  | 'syncStyleFromSelected'
  | 'setImageSlot'
  | 'generateMultiSlides'
  | 'reorderReadingOrder'
  | 'detachBento'
  | 'mosaikafySelection'
  | 'applyEntranceAnimations';

export interface BentoRpcRequest<TParams = unknown> {
  id: string;
  method: BentoRpcMethod;
  params: TParams;
}

export interface BentoRpcSuccessResponse<TResult = unknown> {
  id: string;
  result: TResult;
}

export interface BentoRpcErrorResponse {
  id: string;
  error: {
    code: BentoErrorCode | string;
    message: string;
  };
}

export type BentoRpcResponse<TResult = unknown> =
  | BentoRpcSuccessResponse<TResult>
  | BentoRpcErrorResponse;

export interface BentoRpcEvent {
  event: 'selectionChanged';
}
