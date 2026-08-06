# Link Tracker

Site simples para coletar links enviados por várias pessoas, sem permitir
duplicados, com ranking público e painel de administração protegido por senha.

## O que ele faz

- Qualquer pessoa acessa a página inicial, digita o nome e cola o link do
  vídeo/clipe.
- Se o link já foi enviado antes (por qualquer pessoa), o sistema recusa e avisa.
- Editores NÃO veem ranking nem os links de outras pessoas — só o formulário
  de envio.
- Em `/admin.html`, protegido por senha, só você vê:
  - o ranking de quem mais enviou;
  - a lista de todas as pessoas, com todos os vídeos que cada uma enviou.

## 1. Rodando no seu computador (para testar)

Pré-requisitos: [Node.js](https://nodejs.org) instalado (versão 18 ou mais recente).

```bash
cd link-tracker
npm install
cp .env.example .env
```

Abra o arquivo `.env` e troque `ADMIN_PASSWORD` por uma senha sua, e
`SESSION_SECRET` por qualquer texto aleatório longo.

Depois:

```bash
npm start
```

Acesse no navegador: `http://localhost:3000`

O banco SQLite (`links.db`) é criado automaticamente na primeira vez que
o servidor roda, na mesma pasta do projeto.

**Importante:** rodando assim, só o SEU computador consegue acessar o site
(via `localhost`). Para outras pessoas acessarem de outros computadores,
você precisa publicar o site na internet — veja o passo 2.

## 2. Colocando o site na internet (para outras pessoas acessarem)

A forma mais simples e gratuita é usar o **Render** ou o **Railway**.
Ambos rodam seu servidor Node.js 24 horas por dia e te dão um link
público (algo como `https://seu-projeto.onrender.com`).

### Passo a passo com o Render (grátis)

1. Crie uma conta em https://render.com
2. Suba este projeto para um repositório no GitHub (pode ser privado).
3. No Render, clique em "New +" → "Web Service" e conecte o repositório.
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Em "Environment Variables", adicione `ADMIN_PASSWORD` e `SESSION_SECRET`
   com os valores que você quiser (não coloque o arquivo `.env` no GitHub).
6. Clique em "Create Web Service". Em alguns minutos você recebe uma URL
   pública — é esse link que você compartilha com as pessoas.

**Atenção com o SQLite em produção:** no plano gratuito do Render, o
sistema de arquivos é apagado a cada novo deploy, o que apagaria o
`links.db`. Para não perder os dados, adicione um "Persistent Disk"
gratuito (o Render oferece isso mesmo no plano free) e aponte o caminho
do banco para dentro desse disco. Se preferir não se preocupar com isso,
me avise que eu ajusto o projeto para usar um banco Postgres gratuito
(ex: no próprio Render ou no Supabase), que não tem esse problema.

## Estrutura do projeto

```
link-tracker/
  server.js        -> servidor Express (rotas da API)
  db.js             -> conexão com SQLite e funções do banco
  public/
    index.html      -> página pública (enviar link + ranking)
    admin.html       -> painel de administração
    app.js / admin.js -> lógica do front-end
    style.css        -> estilo visual
  .env.example       -> modelo de variáveis de ambiente
```

## Segurança (leia antes de divulgar o link)

- Troque a senha padrão do admin antes de publicar.
- Nunca coloque o arquivo `.env` no GitHub (ele já devia estar num `.gitignore`).
- Esse projeto é pensado para uso pessoal/pequenos grupos. Para uso em
  maior escala, valeria reforçar a autenticação (ex: limite de tentativas
  de senha) — posso te ajudar com isso se precisar.
