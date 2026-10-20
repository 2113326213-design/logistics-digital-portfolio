export default {
  plugins:[{name:'workspace-preview',configureServer(server){server.middlewares.use('/api/workspace',(_req,res)=>{res.statusCode=401;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'请登录 ChatGPT 后使用自动保存。',code:'sign-in'}));});}}],
  root: 'public',
  // The dev server serves the real inventory (data.json): local only unless VITE_HOST opts in, e.g. VITE_HOST=0.0.0.0.
  server: {host:process.env.VITE_HOST||'127.0.0.1',allowedHosts:['terminal.local']},
  optimizeDeps: {noDiscovery:true},
};
