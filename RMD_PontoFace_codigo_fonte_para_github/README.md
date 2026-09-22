# RMD PontoFace — integração final

## Arquitetura

Funcionário
→ link individual
→ PWA
→ geolocalização
→ AWS Amplify FaceLivenessDetector
→ Amazon Rekognition Face Liveness
→ comparação facial
→ Supabase
→ dashboard da empresa.

A região do Rekognition é `sa-east-1` (São Paulo), que é a região brasileira com Face Liveness. A localização do funcionário continua sendo obtida pelo GPS do próprio aparelho.

## Backend Supabase já preparado

Projeto: `rmd-pontoface`

Funções:
- `generate-employee-access`
- `start-face-liveness-v2`
- `complete-face-liveness-v2`
- `enroll-employee-face`
- `sync-attendance-v2`

Storage privado:
- `facial-references`

## AWS obrigatório

O FaceLivenessDetector precisa de recursos AWS/Cognito para assinar a chamada de streaming. O arquivo `infra/cognito-liveness.yaml` cria:
- Cognito Identity Pool;
- acesso guest controlado;
- IAM role com somente `rekognition:StartFaceLivenessSession`.

A documentação oficial do Amplify recomenda exatamente um Identity Pool para autorizar o FaceLivenessDetector e uma política restrita à ação `rekognition:StartFaceLivenessSession`.

Depois do deploy do CloudFormation, coloque o `IdentityPoolId` no `.env`.

## Credenciais do backend

As Edge Functions do Supabase precisam dos secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION=sa-east-1`

A identidade usada pelo backend deve ter, no mínimo:
- `rekognition:CreateFaceLivenessSession`
- `rekognition:GetFaceLivenessSessionResults`
- `rekognition:CompareFaces`
- `rekognition:DetectFaces`

Não coloque essas chaves no navegador.

## Instalação

1. Copie `.env.example` para `.env`.
2. Preencha os valores do Supabase e Cognito.
3. `npm install`
4. `npm run dev`
5. Para produção: `npm run build`.

## Cadastro facial

O administrador deve:
1. criar o funcionário;
2. capturar a foto;
3. enviar a foto para o bucket privado `facial-references`;
4. chamar `enroll-employee-face` com `company_id`, `employee_id` e `reference_image_path`.

O servidor valida que existe exatamente um rosto e verifica qualidade antes de marcar o perfil como `enrolled`.

## Ponto

Com internet:
1. cria sessão;
2. FaceLivenessDetector realiza o desafio;
3. servidor consulta resultado;
4. compara referência do liveness com a referência cadastrada;
5. captura/usa GPS;
6. grava ponto com horário original.

Sem internet:
1. guarda horário, GPS e ID no IndexedDB;
2. status `offline_pending`;
3. ao voltar a internet, sincroniza;
4. a validação biométrica é feita antes da confirmação definitiva.

O navegador nunca deve receber a chave secreta da AWS.

## Observação de produção

O Face Liveness é probabilístico e não garante resultado perfeito. Os limiares precisam ser validados com testes reais do caso de uso. A AWS recomenda testar os thresholds e usar outros controles, como geolocalização e autenticação, em conjunto.

A câmera e a geolocalização exigem HTTPS. O Face Liveness também possui requisitos mínimos de dispositivo, câmera, navegador e conexão.
