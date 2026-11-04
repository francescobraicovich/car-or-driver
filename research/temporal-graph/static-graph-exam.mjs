// Historical static control, with the shared evidence extraction rules.
import { teammateGraphExam } from '../../packages/core/src/teammate-graph-exam.js';
import { createTeammateGraph } from './static-teammate-graph.mjs';
export const staticGraphExam = (weekends, options) => teammateGraphExam(weekends, { ...options, createGraph: createTeammateGraph });
