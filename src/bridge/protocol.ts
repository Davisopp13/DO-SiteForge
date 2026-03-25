// Shared message types between editor <-> bridge
// All messages are prefixed with "forge:" to avoid conflicts with the target site's own postMessage usage

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementInfo {
  tagName: string;
  id: string;
  className: string;
  xpath: string;
  textContent: string;
  boundingRect: ElementRect;
  computedStyles: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontFamily: string;
    padding: string;
    margin: string;
    borderRadius: string;
    display: string;
    position: string;
    width: string;
    height: string;
  };
}

// Messages from editor -> bridge
export interface GetElementAtPointMessage {
  type: 'forge:getElementAtPoint';
  x: number;
  y: number;
}

export interface GetElementByXPathMessage {
  type: 'forge:getElementByXPath';
  xpath: string;
}

export interface GetAllEditableElementsMessage {
  type: 'forge:getAllEditableElements';
}

export interface MoveMessage {
  type: 'forge:move';
  xpath: string;
  deltaX: number;
  deltaY: number;
}

export interface TextEditStartMessage {
  type: 'forge:textEditStart';
  xpath: string;
}

export interface TextEditEndMessage {
  type: 'forge:textEditEnd';
  xpath: string;
}

export type EditorToBridgeMessage =
  | GetElementAtPointMessage
  | GetElementByXPathMessage
  | GetAllEditableElementsMessage
  | MoveMessage
  | TextEditStartMessage
  | TextEditEndMessage;

// Messages from bridge -> editor
export interface HoverMessage {
  type: 'forge:hover';
  element: ElementInfo | null;
}

export interface SelectMessage {
  type: 'forge:select';
  element: ElementInfo | null;
}

export interface ElementInfoResponse {
  type: 'forge:elementInfo';
  element: ElementInfo | null;
  requestType: 'atPoint' | 'byXPath';
}

export interface EditableElementsResponse {
  type: 'forge:editableElements';
  elements: ElementInfo[];
}

export interface TextEditCompleteMessage {
  type: 'forge:textEditComplete';
  xpath: string;
  oldText: string;
  newText: string;
}

export interface MoveCompleteMessage {
  type: 'forge:moveComplete';
  xpath: string;
  finalRect: ElementRect;
}

export type BridgeToBridgeMessage =
  | HoverMessage
  | SelectMessage
  | ElementInfoResponse
  | EditableElementsResponse
  | TextEditCompleteMessage
  | MoveCompleteMessage;
