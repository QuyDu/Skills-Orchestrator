# Security Review

One medium-severity hosted supply-chain weakness remains for the P4 candidate.

Main now enforces strict Security Validation and CodeQL checks, admin protection, linear history, conversation resolution, and force-push/deletion prevention. Secret scanning, push protection, dependency alerts/security updates, automated fixes, private vulnerability reporting, restricted GitHub-owned Actions, and CodeQL result upload are enabled.

Required human review remains unset because the repository has only one write-capable collaborator. A distinct reviewer must be provisioned before that control can be enabled, and this assessment is not the separately signed independent approval required for production release.