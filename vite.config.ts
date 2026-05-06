import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, Plugin} from 'vite';
import type { IncomingMessage } from 'http';

const readJsonBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const groqLeaderApiPlugin = (apiKey: string | undefined, model: string): Plugin => ({
  name: 'groq-leader-api',
  configureServer(server) {
    server.middlewares.use('/api/leader-plan', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      if (!apiKey) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'GROQ_API_KEY is not configured. Local planner fallback is active.' }));
        return;
      }

      try {
        const snapshot = await readJsonBody(req);
        const compactSnapshot = {
          tick: snapshot.tick,
          formation: snapshot.formation,
          behavior: snapshot.behavior,
          centroid: snapshot.centroid,
          target: snapshot.target,
          metrics: snapshot.metrics,
          reports: Array.isArray(snapshot.reports) ? snapshot.reports.slice(0, 24) : [],
        };
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_completion_tokens: 120,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: [
                  'Drone swarm leader. Return only compact JSON.',
                  'Command enum: HOLD_FORMATION, REGROUP, EXPAND_SEARCH, AVOID_HAZARDS, CONSERVE_ENERGY.',
                  'Shape: {"command":"...","confidence":0.0,"summary":"max 12 words","target":null}',
                ].join(' '),
              },
              {
                role: 'user',
                content: JSON.stringify(compactSnapshot),
              },
            ],
          }),
        });

        if (!groqResponse.ok) {
          const errorText = await groqResponse.text();
          res.statusCode = groqResponse.status;
          res.setHeader('Content-Type', 'application/json');
          const retryMatch = errorText.match(/try again in ([\d.]+)/i);
          res.end(JSON.stringify({
            error: `Groq API error: ${errorText.slice(0, 240)}`,
            retryAfterSeconds: retryMatch ? Number(retryMatch[1]) : undefined,
          }));
          return;
        }

        const completion = await groqResponse.json();
        const content = completion.choices?.[0]?.message?.content || '{}';
        const decision = JSON.parse(content);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ...decision, model }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to ask Groq leader model.',
        }));
      }
    });
  },
});

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const isGithubPagesBuild = process.env.GITHUB_ACTIONS === 'true' && Boolean(repoName);
  const groqModel = env.GROQ_MODEL || 'llama-3.1-8b-instant';

  return {
    base: isGithubPagesBuild ? `/${repoName}/` : '/',
    plugins: [react(), tailwindcss(), groqLeaderApiPlugin(env.GROQ_API_KEY, groqModel)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
