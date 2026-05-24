'use client';

import { useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type EdgeMouseHandler,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { IvrOption } from '@/lib/ivr-format';

interface Props {
  menuNumber: string;
  menuName?: string | null;
  options: IvrOption[];
  onRemoveAt?: (index: number) => void;
  onAdd?: () => void;
}

const TARGET_NODE_X = 360;
const TARGET_NODE_Y_STEP = 80;

function targetNodeId(opt: IvrOption, index: number): string {
  if (opt.action === 'hangup') return `hangup-${index}`;
  return `${opt.action}-${opt.target ?? 'none'}`;
}

function targetLabel(opt: IvrOption): string {
  if (opt.action === 'hangup') return '切断';
  if (opt.action === 'goto_extension') return `内線 ${opt.target ?? '?'}`;
  if (opt.action === 'goto_ringgroup') return `着信G ${opt.target ?? '?'}`;
  if (opt.action === 'goto_ivr') return `IVR ${opt.target ?? '?'}`;
  return opt.target ?? '?';
}

function targetStyle(opt: IvrOption): { background: string; border: string } {
  if (opt.action === 'hangup') return { background: '#fff1f2', border: '1px solid #fecdd3' };
  if (opt.action === 'goto_ringgroup') return { background: '#fffbeb', border: '1px solid #fde68a' };
  if (opt.action === 'goto_ivr') return { background: '#ecfeff', border: '1px solid #a5f3fc' };
  return { background: '#ecfdf5', border: '1px solid #a7f3d0' };
}

export function IvrCanvas({ menuNumber, menuName, options, onRemoveAt, onAdd }: Props) {
  const { nodes, edges } = useMemo(() => buildGraph(menuNumber, menuName, options), [
    menuNumber,
    menuName,
    options,
  ]);

  const handleEdgeClick: EdgeMouseHandler = (_e, edge) => {
    if (!onRemoveAt) return;
    const idx = edge.data?.optionIndex;
    if (typeof idx !== 'number') return;
    const opt = options[idx];
    const label = opt?.label ? `（${opt.label}）` : '';
    if (window.confirm(`番号「${opt?.digit ?? ''}」${label}の分岐を削除しますか？`)) {
      onRemoveAt(idx);
    }
  };

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-lg border border-slate-200 bg-[#f4f6f3]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesConnectable={false}
        edgesReconnectable={false}
        onEdgeClick={handleEdgeClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="absolute right-2 top-2 z-10 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-50"
        >
          + 分岐を追加
        </button>
      )}
    </div>
  );
}

function buildGraph(
  menuNumber: string,
  menuName: string | null | undefined,
  options: IvrOption[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: `ivr-${menuNumber}`,
      position: { x: 0, y: Math.max(0, (options.length - 1) * (TARGET_NODE_Y_STEP / 2)) },
      data: {
        label: (
          <div className="px-1 text-center">
            <div className="text-xs font-semibold text-emerald-800">IVR {menuNumber}</div>
            {menuName && <div className="text-[10px] text-slate-500">{menuName}</div>}
          </div>
        ),
      },
      style: {
        background: '#dcfce7',
        border: '1px solid #86efac',
        borderRadius: 8,
        padding: 8,
        minWidth: 120,
      },
    },
  ];
  const edges: Edge[] = [];
  const seenTargets = new Set<string>();

  options.forEach((opt, i) => {
    const tid = targetNodeId(opt, i);
    if (!seenTargets.has(tid)) {
      seenTargets.add(tid);
      const style = targetStyle(opt);
      nodes.push({
        id: tid,
        position: { x: TARGET_NODE_X, y: i * TARGET_NODE_Y_STEP },
        data: { label: targetLabel(opt) },
        style: {
          ...style,
          borderRadius: 8,
          padding: 8,
          fontSize: 12,
          minWidth: 100,
        },
      });
    }
    edges.push({
      id: `edge-${i}-${opt.digit}`,
      source: `ivr-${menuNumber}`,
      target: tid,
      label: opt.label ? `${opt.digit} ${opt.label}` : opt.digit,
      labelStyle: { fontSize: 11, fontWeight: 600 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: '#ffffff', stroke: '#d1fae5' },
      data: { optionIndex: i },
      style: { cursor: 'pointer', stroke: '#059669' },
    });
  });

  return { nodes, edges };
}
