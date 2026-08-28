# Project Video Script

## Project purpose

Project Skills Orchestrator turns a repository into a governed GitHub Copilot workspace. It installs reusable instructions, prompts, specialist agents, and bounded skills, then verifies the result so teams can adopt automation consistently and rerun it safely.

## Architecture

The runtime centers on a registry-free Node command line. Configuration selects governed profiles, templates carry the baseline into new repositories, schemas define machine-readable contracts, and reports preserve authoritative evidence for later workflow decisions.

## Technology

The implementation uses modern JavaScript modules on maintained Node releases. PowerShell provides Windows-friendly entry points and Azure automation, Bicep defines the optional cloud baseline, and JSON schemas validate durable contracts and generated evidence.

## Key features

Forty-one governed skills cover setup, audits, planning, recovery, release preparation, Azure discovery, and project communication. Transactional adoption protects existing repositories, while ownership rules prevent duplicate commands and conflicting report producers.

## Setup and use

Contributors install the package prerequisites, invoke the command line to create or adopt a project, and use profiles to select required capabilities. Inventory and verification commands explain what was installed without requiring a package registry.

## Skills and prompts

Skills own bounded actions such as architecture review, debugging, and project understanding. Prompts remain focused on distinct guided experiences and help, while repository instructions enforce clarification, approval gates, and safe tool boundaries before work begins.

## Workflows

A typical workflow clarifies intent, plans bounded changes, executes only approved actions, validates results, and records a handoff. Azure choices are persisted without secrets, and external processing, deployment, publication, and destructive operations remain separately approval-gated.

## Validation and limits

The complete local gate checks syntax, security, release integrity, regression tests, and all skill contracts. Version 1.1.0 passes locally, but production distribution still requires current cross-platform evidence, trusted signing, and independent review.
