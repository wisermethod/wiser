// Invented envelopes only. Like a shipped connector, this module writes nothing.
export const modules = {
  audio: {
    async render(_input, ctx) {
      const { data: envelope } = await ctx.proxy({ endpoint: '/invented-audio', method: 'POST', body: { with_timestamps: true } });
      if (envelope.status) return { status: envelope.status, action: 'file-output-fixture.audio.render' };
      const result = { timings: envelope.timings ?? [] };
      if (envelope.omit_slot) return result;
      let data = envelope.not_bytes ? envelope.audio : Buffer.from(envelope.audio, 'base64');
      if (envelope.uint8) {
        const backing = new Uint8Array(data.length + 2);
        backing.set(data, 1);
        data = backing.subarray(1, backing.length - 1);
      }
      return { ...result, output_file: { media_type: envelope.media_type ?? 'audio/mpeg', data } };
    },
  },
};
