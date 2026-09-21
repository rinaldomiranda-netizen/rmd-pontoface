# Configuração AWS do backend

Crie uma identidade IAM usada SOMENTE pelo backend do PontoFace.

Permissões mínimas:
- rekognition:CreateFaceLivenessSession
- rekognition:GetFaceLivenessSessionResults
- rekognition:CompareFaces
- rekognition:DetectFaces

Depois configure no projeto Supabase Edge Functions os secrets:

AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION=sa-east-1

Nunca coloque essas credenciais no navegador, no PWA, no GitHub ou no arquivo `.env` que será distribuído.

Para o navegador, o acesso é diferente: o FaceLivenessDetector usa um Cognito Identity Pool apenas para assinar `StartFaceLivenessSession`, com a permissão mínima dessa ação.
