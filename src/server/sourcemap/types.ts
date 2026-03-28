export interface MoveEdit {
  type: 'move';
  sourceLine: number;
  sourceCol: number;
  filepath: string;
  deltaX: number;
  deltaY: number;
}

export interface TextEdit {
  type: 'text';
  sourceLine: number;
  sourceCol: number;
  filepath: string;
  oldText: string;
  newText: string;
}

export interface DeleteEdit {
  type: 'delete';
  sourceLine: number;
  sourceCol: number;
  filepath: string;
}

export interface InsertEdit {
  type: 'insert';
  targetLine: number;
  targetCol: number;
  filepath: string;
  html: string;
}

export interface StyleEdit {
  type: 'style';
  sourceLine: number;
  sourceCol: number;
  filepath: string;
  property: string;
  value: string;
}

export type VisualEdit = MoveEdit | TextEdit | DeleteEdit | InsertEdit | StyleEdit;

export interface PatchResult {
  success: boolean;
  filepath: string;
  linesBefore: number;
  linesAfter: number;
  error?: string;
}
