# AWS 백엔드 배포 가이드

FastAPI 백엔드, PostgreSQL, Redis를 AWS에 배포하는 방법을 설명합니다.

## 🏗️ AWS 배포 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     AWS Cloud                               │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Application Load Balancer (ALB)                   │   │
│  │  - HTTPS 인증서 (ACM)                              │   │
│  │  - 도메인 연결                                      │   │
│  └──────────────┬──────────────────────────────────────┘   │
│                 │                                           │
│  ┌──────────────▼────────────────────────────────────┐     │
│  │  Amazon ECS (Elastic Container Service)          │     │
│  │  ┌────────────────────────────────────────────┐  │     │
│  │  │  Fargate Task (Backend Container)         │  │     │
│  │  │  - FastAPI 서버                            │  │     │
│  │  │  - Auto Scaling                           │  │     │
│  │  └────────┬─────────────────────┬──────────────┘  │     │
│  └───────────┼─────────────────────┼─────────────────┘     │
│              │                     │                        │
│  ┌───────────▼──────────┐  ┌──────▼──────────────┐        │
│  │  Amazon RDS          │  │  ElastiCache Redis  │        │
│  │  (PostgreSQL+PostGIS)│  │  - 캐싱             │        │
│  │  - 자동 백업         │  │  - 세션 저장        │        │
│  │  - Multi-AZ (고가용성)│  └─────────────────────┘        │
│  └──────────────────────┘                                  │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Amazon ECR (Elastic Container Registry)          │   │
│  │  - Docker 이미지 저장                              │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 배포 옵션 비교

### 옵션 1: ECS Fargate (추천 - 서버리스)

**장점:**
- ✅ 서버 관리 불필요
- ✅ 자동 스케일링
- ✅ 고가용성
- ✅ 로드 밸런싱 내장

**단점:**
- ❌ 비용이 비교적 높음
- ❌ 초기 설정 복잡

**비용 예상:**
- Fargate: ~$30-50/월
- RDS: ~$30-50/월
- Redis: ~$20/월
- **총 ~$80-120/월**

### 옵션 2: EC2 + Docker Compose (저렴)

**장점:**
- ✅ 비용 절감
- ✅ 간단한 설정
- ✅ 전체 제어 가능

**단점:**
- ❌ 서버 관리 필요
- ❌ 수동 스케일링
- ❌ 직접 로드 밸런싱 설정 필요

**비용 예상:**
- EC2 t3.small: ~$15-20/월
- RDS t3.micro: ~$15/월
- ElastiCache t2.micro: ~$12/월
- **총 ~$42-47/월**

---

## 🚀 방법 1: ECS Fargate 배포 (추천)

### 1단계: ECR 저장소 생성

```bash
# AWS CLI 설치 확인
aws --version

# ECR 저장소 생성
aws ecr create-repository \
  --repository-name homu-backend \
  --region ap-northeast-2

# 출력 예시:
# {
#   "repository": {
#     "repositoryUri": "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/homu-backend"
#   }
# }
```

### 2단계: Docker 이미지 빌드 및 푸시

```bash
# 프로젝트 루트에서
cd backend

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.ap-northeast-2.amazonaws.com

# Docker 이미지 빌드
docker build -t homu-backend:latest .

# 태그 지정
docker tag homu-backend:latest \
  123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/homu-backend:latest

# ECR에 푸시
docker push 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/homu-backend:latest
```

### 3단계: RDS PostgreSQL 생성

**AWS Console에서:**

1. **RDS** → **데이터베이스 생성**
2. **설정:**
   - 엔진: PostgreSQL 15
   - 템플릿: 프리 티어 또는 개발/테스트
   - DB 인스턴스 식별자: `homu-db`
   - 마스터 사용자 이름: `postgres`
   - 마스터 암호: 안전한 암호 설정
3. **인스턴스 구성:**
   - 클래스: db.t3.micro (프리 티어) 또는 db.t3.small
4. **스토리지:**
   - 할당된 스토리지: 20 GB
   - 자동 스케일링 활성화
5. **연결:**
   - VPC: 기본 VPC
   - 퍼블릭 액세스: 아니요 (보안)
   - VPC 보안 그룹: 새로 생성 (`homu-db-sg`)
6. **추가 구성:**
   - 초기 데이터베이스 이름: `homu_db`
   - 자동 백업 활성화
7. **생성**

### 4단계: ElastiCache Redis 생성

**AWS Console에서:**

1. **ElastiCache** → **Redis 클러스터 생성**
2. **설정:**
   - 클러스터 모드: 비활성화됨
   - 이름: `homu-redis`
   - 노드 유형: cache.t2.micro (프리 티어)
3. **서브넷 그룹:**
   - 새로 생성 또는 기존 사용
4. **보안 그룹:**
   - 새로 생성 (`homu-redis-sg`)
5. **생성**

### 5단계: ECS 클러스터 생성

```bash
# ECS 클러스터 생성
aws ecs create-cluster \
  --cluster-name homu-cluster \
  --region ap-northeast-2
```

### 6단계: ECS Task Definition 생성

`backend/ecs-task-definition.json` 파일 생성:

```json
{
  "family": "homu-backend-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "homu-backend",
      "image": "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/homu-backend:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "API_V1_STR",
          "value": "/api/v1"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:homu/db-url"
        },
        {
          "name": "REDIS_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:homu/redis-url"
        },
        {
          "name": "SECRET_KEY",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:homu/secret-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/homu-backend",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

**Task Definition 등록:**

```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json
```

### 7단계: ECS Service 생성

```bash
# 서비스 생성
aws ecs create-service \
  --cluster homu-cluster \
  --service-name homu-backend-service \
  --task-definition homu-backend-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

### 8단계: Load Balancer 설정

**AWS Console에서:**

1. **EC2** → **로드 밸런서** → **생성**
2. **Application Load Balancer** 선택
3. **설정:**
   - 이름: `homu-alb`
   - 체계: 인터넷 경계
   - 리스너: HTTP (80), HTTPS (443)
4. **가용 영역 선택** (최소 2개)
5. **보안 그룹 설정**
6. **대상 그룹 생성:**
   - 대상 유형: IP
   - 프로토콜: HTTP
   - 포트: 8000
   - 헬스 체크 경로: `/health`
7. **생성**

---

## 🛠️ 방법 2: EC2 + Docker Compose 배포 (저렴)

### 1단계: EC2 인스턴스 생성

**AWS Console에서:**

1. **EC2** → **인스턴스 시작**
2. **AMI 선택:** Ubuntu Server 22.04 LTS
3. **인스턴스 유형:** t3.small (2 vCPU, 2GB RAM)
4. **키 페어:** 새로 생성 또는 기존 사용
5. **네트워크 설정:**
   - VPC: 기본
   - 퍼블릭 IP 자동 할당: 활성화
   - 보안 그룹:
     - SSH (22): 내 IP
     - HTTP (80): 0.0.0.0/0
     - HTTPS (443): 0.0.0.0/0
     - Custom TCP (8000): 0.0.0.0/0
6. **스토리지:** 20 GB gp3
7. **시작**

### 2단계: EC2 초기 설정

```bash
# SSH 접속
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.ap-northeast-2.compute.amazonaws.com

# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Docker 설치
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu

# 재접속 필요 (docker 그룹 적용)
exit
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.ap-northeast-2.compute.amazonaws.com
```

### 3단계: 프로젝트 배포

```bash
# Git 설치
sudo apt install -y git

# 프로젝트 클론
git clone https://github.com/your-org/techeer-team-b-2026.git
cd techeer-team-b-2026

# .env 파일 생성
nano .env
# 환경 변수 입력 (DATABASE_URL, REDIS_URL 등)

# Docker Compose로 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 4단계: RDS 및 ElastiCache 연결

RDS와 ElastiCache는 위의 ECS 방법과 동일하게 생성하고, `.env` 파일에 연결 정보를 추가합니다.

```bash
# .env 파일 예시
DATABASE_URL=postgresql+asyncpg://postgres:password@homu-db.xxxxx.ap-northeast-2.rds.amazonaws.com:5432/homu_db
REDIS_URL=redis://homu-redis.xxxxx.cache.amazonaws.com:6379/0
```

### 5단계: 자동 재시작 설정

```bash
# systemd 서비스 생성
sudo nano /etc/systemd/system/homu-backend.service
```

내용:

```ini
[Unit]
Description=HOMU Backend Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/techeer-team-b-2026
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
User=ubuntu

[Install]
WantedBy=multi-user.target
```

활성화:

```bash
sudo systemctl enable homu-backend
sudo systemctl start homu-backend
```

---

## 🔐 보안 그룹 설정

### Backend 보안 그룹

```
인바운드 규칙:
- Type: HTTP, Port: 8000, Source: ALB 보안 그룹 또는 0.0.0.0/0
- Type: HTTPS, Port: 443, Source: 0.0.0.0/0

아웃바운드 규칙:
- Type: All traffic, Destination: 0.0.0.0/0
```

### RDS 보안 그룹

```
인바운드 규칙:
- Type: PostgreSQL, Port: 5432, Source: Backend 보안 그룹

아웃바운드 규칙:
- Type: All traffic, Destination: 0.0.0.0/0
```

### Redis 보안 그룹

```
인바운드 규칙:
- Type: Custom TCP, Port: 6379, Source: Backend 보안 그룹

아웃바운드 규칙:
- Type: All traffic, Destination: 0.0.0.0/0
```

---

## 🔄 GitHub Actions와 통합

백엔드 코드가 푸시되면 자동으로 AWS에 배포하도록 설정합니다.

`.github/workflows/backend-cd.yml`에서 사용한 워크플로우를 활용합니다.

### GitHub Secrets 설정

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2
ECR_REPOSITORY=homu-backend
ECS_CLUSTER=homu-cluster
ECS_SERVICE=homu-backend-service
```

---

## 📊 모니터링 및 로깅

### CloudWatch 로그 확인

```bash
# AWS CLI로 로그 확인
aws logs tail /ecs/homu-backend --follow
```

### CloudWatch 알람 설정

1. **CloudWatch** → **알람** → **생성**
2. **메트릭 선택:**
   - CPU 사용률 > 80%
   - 메모리 사용률 > 80%
   - 헬스 체크 실패
3. **SNS 주제 연결** (이메일 알림)

---

## 💰 비용 최적화

### 1. RDS 예약 인스턴스

1년 또는 3년 약정 시 최대 60% 절감

### 2. Fargate Spot

일반 Fargate 대비 최대 70% 저렴 (중단 가능)

### 3. 자동 스케일링

```
# 야간/주말에는 인스턴스 축소
최소 1개 → 트래픽 증가 시 자동 확장
```

### 4. S3 라이프사이클 정책

로그 파일 30일 후 자동 삭제

---

## 🐛 문제 해결

### 문제 1: RDS 연결 실패

**해결:**
- 보안 그룹 확인
- RDS 엔드포인트 확인
- 퍼블릭 액세스 설정 확인

### 문제 2: ECS Task 시작 실패

**해결:**
- Task Definition의 CPU/메모리 설정 확인
- IAM 역할 권한 확인
- 환경 변수 확인

### 문제 3: 높은 비용

**해결:**
- EC2 옵션으로 전환
- 예약 인스턴스 사용
- 자동 스케일링 설정

---

**다음 문서에서는 전체 CI/CD 파이프라인을 통합합니다!**
