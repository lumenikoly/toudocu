export const mermaidMaxBytes = 50_000;

export interface MermaidPolicy {
  diagramType: string;
  tooLarge: boolean;
  configurationForbidden: boolean;
  valid: boolean;
}

export function checkMermaid(source: string): MermaidPolicy {
  let bytes = 0;
  for (const character of source) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  const lines = source.split('\n').map((line) => line.trim());
  const first = lines.find((line) => line !== '') ?? '';
  const words = first.split(/\s+/);
  const configurationForbidden =
    lines.some((line) => line.startsWith('%%{')) || first === '---' || first === '+++';
  let diagramType = '';
  if (
    words[0] === 'flowchart' &&
    (words.length === 1 ||
      (words.length === 2 && ['TD', 'TB', 'BT', 'LR', 'RL'].includes(words[1] ?? '')))
  )
    diagramType = 'flowchart';
  if (words.length === 1 && (first === 'stateDiagram-v2' || first === 'sequenceDiagram'))
    diagramType = first;
  const tooLarge = bytes > mermaidMaxBytes;
  return {
    diagramType,
    tooLarge,
    configurationForbidden,
    valid: !tooLarge && !configurationForbidden && diagramType !== '',
  };
}
