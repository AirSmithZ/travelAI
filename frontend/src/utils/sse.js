export function createSSEParser(onEvent) {
  let buffer = '';

  return {
    push(chunkText) {
      buffer += chunkText;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split('\n').filter(Boolean);
        let eventName = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        try {
          onEvent(eventName, JSON.parse(dataLine));
        } catch {
          // ignore invalid chunk
        }
      }
    },
  };
}

