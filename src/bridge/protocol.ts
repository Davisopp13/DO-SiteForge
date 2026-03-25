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

export interface FinishMoveMessage {
  type: 'forge:finishMove';
  xpath: string;
}

export interface TextEditStartMessage {
  type: 'forge:textEditStart';
  xpath: string;
}

export interface TextEditEndMessage {
  type: 'forge:textEditEnd';
  xpath: string;
}

export interface UndoRedoMoveMessage {
  type: 'forge:undoRedoMove';
  xpath: string;
  deltaX: number;
  deltaY: number;
}

export interface UndoRedoTextMessage {
  type: 'forge:undoRedoText';
  xpath: string;
  text: string;
}

export interface DeleteElementMessage {
  type: 'forge:deleteElement';
  xpath: string;
}

export interface NudgeElementMessage {
  type: 'forge:nudgeElement';
  xpath: string;
  deltaX: number;
  deltaY: number;
}

export interface InsertElementMessage {
  type: 'forge:insertElement';
  x: number;
  y: number;
}

export interface RemoveElementMessage {
  type: 'forge:removeElement';
  xpath: string;
}

export interface ReinsertElementMessage {
  type: 'forge:reinsertElement';
  parentXPath: string;
  childIndex: number;
  html: string;
}

export interface GetPageSummaryMessage {
  type: 'forge:getPageSummary';
}

export type EditorToBridgeMessage =
  | GetElementAtPointMessage
  | GetElementByXPathMessage
  | GetAllEditableElementsMessage
  | MoveMessage
  | FinishMoveMessage
  | TextEditStartMessage
  | TextEditEndMessage
  | UndoRedoMoveMessage
  | UndoRedoTextMessage
  | DeleteElementMessage
  | NudgeElementMessage
  | InsertElementMessage
  | RemoveElementMessage
  | ReinsertElementMessage
  | GetPageSummaryMessage;

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

export interface ElementDeletedMessage {
  type: 'forge:elementDeleted';
  xpath: string;
}

export interface NudgeCompleteMessage {
  type: 'forge:nudgeComplete';
  xpath: string;
  finalRect: ElementRect;
  totalDeltaX: number;
  totalDeltaY: number;
}

export interface ElementInsertedMessage {
  type: 'forge:elementInserted';
  element: ElementInfo;
  parentXPath: string;
  childIndex: number;
  html: string;
}

export interface ElementRemovedMessage {
  type: 'forge:elementRemoved';
  xpath: string;
}

export interface PageSummaryEntry {
  tag: string;
  className: string;
  id: string;
  role: string;
  textPreview: string;
  childCount: number;
  boundingRect: ElementRect;
}

export interface PageSummaryResponse {
  type: 'forge:pageSummary';
  entries: PageSummaryEntry[];
}

export type BridgeToEditorMessage =
  | HoverMessage
  | SelectMessage
  | ElementInfoResponse
  | EditableElementsResponse
  | TextEditCompleteMessage
  | MoveCompleteMessage
  | ElementDeletedMessage
  | NudgeCompleteMessage
  | ElementInsertedMessage
  | ElementRemovedMessage
  | PageSummaryResponse;
