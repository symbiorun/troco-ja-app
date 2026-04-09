# TrocoJá — Frontend Setup

## Pré-requisitos
- Node.js 20+
- npm ou pnpm

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais reais

# 3. Copiar assets de marca para /public/assets/
# ✅ Já feito: mascote.png, logo-horizontal.png, logo-vertical.png

# 4. Rodar em desenvolvimento
npm run dev
```

## Configurar Supabase

1. Crie um projeto em https://supabase.com
2. No SQL Editor, execute: `supabase/schema_completo.sql`
3. Em Authentication > Providers, ative Google OAuth
4. Em Storage, crie os buckets: `documents`, `selfies`, `contracts`, `assets`
5. Copie as chaves para `.env.local`

## Estrutura de Páginas

```
/ → /simulacao (redirect)
/simulacao     → Tela 1: Simulador financeiro
/resultado     → Tela 2: Resultado comparativo MP vs Asaas
/cadastro      → Tela 3: Cadastro / Login Google
/pix           → Tela 4: Chave PIX
/documentos    → Tela 5: Upload documentos + selfie (Supabase Storage)
/contrato      → Tela 6: Contrato digital + aceite com audit trail imutável
/pagamento     → Tela 7: Checkout Asaas (link) ou Maquininha MP
/status        → Tela 8: Status em tempo real (Supabase Realtime)
/auth/login    → Login por magic link ou Google OAuth
/dashboard     → Dashboard operacional (lista, filtros, aprovar/rejeitar, marcar PIX)
/admin         → Painel admin (taxas, usuários, relatórios)
```

## API Routes (Next.js)

```
POST /api/simular                     → Simulação financeira com taxas do BD
POST /api/aplicacao                   → Criar nova operação
GET  /api/aplicacao?id=xxx            → Buscar operação
PATCH /api/aplicacao/[id]/status      → Atualizar status (com validação de transição)
POST /api/contrato/aceitar            → Registrar aceite imutável do contrato
POST /api/pagamento/criar             → Criar cobrança no Asaas
GET  /api/pagamento/status/[id]       → Verificar status do pagamento
POST /api/webhook/asaas               → Receber eventos do Asaas (HMAC verificado)
GET  /api/admin/configs               → Buscar configurações admin
PATCH /api/admin/configs              → Atualizar configurações admin
```

## Configurar Webhook Asaas

1. No dashboard Asaas, configure: `https://SEU-DOMINIO.com/api/webhook/asaas`
2. Defina o token em `ASAAS_WEBHOOK_TOKEN` no `.env.local`
3. Eventos monitorados: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`

## Banco de Dados: Supabase (EXCLUSIVO)

- **Postgres**: todos os dados relacionais
- **Auth**: autenticação (e-mail + Google OAuth + magic link)
- **Storage**: documentos, selfies, contratos, assets
- **Realtime**: status ao vivo na tela /status

## Copiar Logos para o Projeto

Os assets de marca ficam em `public/assets/`:
```
public/assets/mascote.png          ← Mascote oficial TrocoJá
public/assets/logo-horizontal.png  ← Logo para cabeçalho (fundo escuro)
public/assets/logo-vertical.png    ← Logo para telas de login/splash
```

**Nota**: As logos têm fundo preto — são exibidas em headers com `bg-primary` (#006b41).
Para uso em fundos claros, solicite versões com fundo transparente.

## Deploy

```bash
# Frontend → Vercel
vercel deploy

# Backend → Railway
# Siga as instruções em troco-ja-backend/README.md
```
