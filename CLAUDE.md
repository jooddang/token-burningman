# token-burningman

## Build & Test

```bash
pnpm run build    # tsup 빌드
pnpm run test     # vitest
pnpm tsc --noEmit # 타입 체크
pnpm audit --prod # 보안 취약점 체크
```

## Pre-commit Verification

작업이 완료되면 반드시 pre-commit hook 체크를 실행하여 깨진 것이 없는지 확인한다:

```bash
sh .git/hooks/pre-commit
```

코드 변경, 리팩토링, 의존성 수정 등 모든 작업 후 커밋 전에 위 명령을 실행한다.
타입 에러, 빌드 실패, 테스트 실패, 보안 취약점이 하나라도 있으면 수정 후 다시 확인한다.
