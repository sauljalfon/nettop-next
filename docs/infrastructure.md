# Net-Top infrastructure design (closed network, 3 servers)

Status: draft for review, revision 2. Date: 2026-10-06.

## 1. Goal and constraints

Run Net-Top (Go API, React frontend, PostgreSQL) on three identical servers on a closed network, with no visible downtime when one server fails, updated through USB now and a laptop push later, built and operated by the owner alone with guided runbooks.

- Servers: 3 × Cisco UCS C220 M5SX, Xeon Silver 4208 (8c/16t), 32 GiB RAM, 2 × 447 GiB SATA SSD behind a MegaRAID SAS3516, 2 × 1 GbE and 2 × 10 GbE SFP+. Same hardware assumed on all three. Each has Cisco CIMC (out-of-band console).
- Network: one Cisco L3 switch, shared with a friend's ISE lab (monitor mode, not enforcing; ISE is removed in production). Each server uses one 1 Gb port. The core design needs no switch changes.
- Build machine: the owner's computer, with internet. Production has no internet. Updates travel as a signed bundle on USB; later the laptop pushes it over SSH.
- Servers have internet only in Phase A, on a temporary DHCP network. Final static IPs are set before the cluster exists.
- No second cluster or off-site storage. Backups live on the same three servers.
- The owner implements everything by hand: writes the Dockerfiles, playbooks, charts and scripts, and runs every command. Claude is the helper: it explains each step, outlines what a file needs, reviews what the owner wrote, and helps debug from pasted output. It has no access to the servers.

## 2. Recorded answers

Decisions asked of the owner on 2026-10-06.

1. **Sizing:** small team (under ~20 users), and no downtime: a server failure or an update must not cause a visible outage. A few seconds of reconnect during a database failover is acceptable.
2. **Platform:** Kubernetes (k3s) with CloudNativePG and Garage (the Prometheus stack later, see 10), chosen deliberately over the simpler alternative (Patroni + keepalived + pgBackRest + Podman/systemd services, roughly half the components). The owner accepts the higher operational cost of running Kubernetes alone and offline.
3. **HTTPS:** version 1 serves plain HTTP inside the closed network: no user-facing CA. HTTPS (an offline root CA signing an intermediate CA whose key lives in the cluster, renewed by cert-manager) is added in the same step that adds any login, so a password never travels in clear text.
4. **Site loss:** accepted risk. The site has UPS, a generator and a secured room. There is no routine off-site copy. Garage's three in-cluster copies are the backup. A manual `backup-export` command (plain files to a USB disk, no schedule, no alert) exists for use before risky operations such as a k3s upgrade or a node rebuild.
5. **Access control before M7:** no login stopgap. Access is restricted by network: only listed workstation addresses can reach the app. Real authentication arrives with M7, together with HTTPS.
6. **Rehearsal location:** one real server as a temporary VM host (section 13).
7. **Environments:** dev on the owner's Mac; test and prod on the cluster, in separate namespaces. Test holds a copy of prod data, refreshed by restoring the latest prod backup (section 10a).
8. **DNS:** CoreDNS instead of Pi-hole (section 9).
9. **Backups:** Garage confirmed over a custom backup service (point-in-time restore, built-in retention and restore). No extra nightly `pg_dump` for now.
10. **Monitoring:** deferred to a later piece. Version 1 has a manual `health-check` command instead (section 9).

## 3. What high availability covers

HA here covers **the failure of one server** (hardware, disk, OS, or a pod on it) and **rolling updates**. It does not cover the switch (single switch), the room's power beyond the UPS and generator, or the loss of the site. Losing two servers stops the cluster from accepting changes (etcd quorum) and has a recovery runbook. The test environment has no HA (one database instance) and may be unavailable while prod is not.

## 4. Decomposition and order

A thin end-to-end slice first, then HA and the platform services one at a time. Each piece gets its own plan and review.

0. **Containerize the app** (in this repo, runnable locally).
1. **Thin slice:** one VM, internet blocked: single-node k3s air-gap install, one Postgres instance through CloudNativePG, the app, a signed bundle, and `deploy` applying it.
2. **Node baseline and HA cluster:** Ansible baseline, then 3-node k3s with kube-vip, on three VMs with the internet blocked.
3. **Database HA and backups:** three Postgres instances, Garage, the Barman Cloud Plugin, etcd snapshots, `backup-export`, a restore drill.
4. *(Deferred: monitoring and alerts, after go-live.)*
5. **DNS, access restriction and the test environment:** CoreDNS on a VIP, the workstation allowlist, the `nettop-test` namespace and its refresh from prod backups.
6. **OS patching:** the offline apt snapshot and the rolling patch procedure.
7. **Go-live on the real servers:** Phase A, Phase B, the drills, and the acceptance checklist.

Pieces 1 to 6 are rehearsed on VMs (section 13) **with the internet blocked**. This is mandatory, because air-gap failures (k3s system images, charts that reference external registries, Grafana fetching plugins, manifests fetched from GitHub) only appear when the internet is really off.

## 5. Phases on the real servers

- **Phase A (DHCP network, internet):** install Ubuntu 24.04 LTS. The baseline playbook installs every OS package needed long term. No cluster yet.
- **Phase B (closed network):** the first playbook step sets the final static IPs. Then k3s, the platform and the app are installed from the bundle, offline. No node IP ever changes after the cluster exists.

## 6. Piece 0: container images

The repo has no Dockerfiles today.

- **API image:** multi-stage build. `CGO_ENABLED=0` static binaries for `cmd/api` and `cmd/db`, in a minimal non-root base image (distroless static). Built for linux/amd64 (plus arm64 if the rehearsal VMs need it).
- **Web image:** `npm ci && npm run build`, served by an unprivileged nginx. The ingress sends `/api` to the API service and everything else to the web service, matching the Vite dev proxy.
- **Migration job:** a Kubernetes Job that runs `db migrate` and then `db init` before each app rollout. `init` creates the empty installed root only when there is none and otherwise prints "already initialized" and exits 0, so it is safe on every rollout; a first rollout therefore ends with an empty, working database. It never runs `db seed`: the seed loads fictional fixture data and must never run in a cluster. The chart never contains a seed command, and a chart test fails if one appears.
- **Configuration:** `DATABASE_URL` from the secret CloudNativePG creates; `HTTP_ADDR` from the chart; `APP_ENV` set by the API Deployment (`test` or `prod` per namespace). `cmd/api` refuses to start without `APP_ENV` being `dev`, `test` or `prod`, and the web header shows a TEST badge (nothing for prod) from `GET /api/health`.
- **Health checks:** readiness uses the existing `GET /api/health`, which pings the database, so a pod without a database stops receiving traffic. Liveness must not depend on the database, or a failover would restart every API pod. Version 1 uses a TCP liveness check on the HTTP port. A separate `GET /api/live` endpoint would be clearer, but it is an app change and is not required.
- **Shutdown:** `cmd/api` already drains on SIGTERM with a 5-second timeout. The pod's termination grace period must exceed it.
- **To verify in piece 0:** whether `cmd/api` exits when the database is unreachable at startup. If it does, Kubernetes restarts it with backoff, which is acceptable.
- **Frontend:** must not load anything from a CDN (fonts, scripts, icons). A check is part of the acceptance list.

## 7. Node baseline

- Ubuntu Server 24.04 LTS, amd64, identical on all nodes.
- **Disks:** the two SSDs mirrored (hardware RAID 1 on the MegaRAID, or a Linux software mirror; see section 14). About 447 GiB usable, as LVM volumes:

  | Volume | Size | Holds |
  |---|---|---|
  | OS (`/`) | 60 GiB | Ubuntu, logs |
  | Kubernetes (`/var/lib/rancher`) | 100 GiB | etcd, local etcd snapshots, images of the last 3 releases |
  | Postgres | 40 GiB | database (a topology database is small) |
  | Garage | 80 GiB | backups and etcd snapshot copies |
  | Prometheus | not created yet | reserved 40 GiB for when monitoring is added |
  | Free | ~165 GiB (incl. the Prometheus reserve) | headroom for growth, extended online with LVM |

- **Network:** one 1 Gb port with a static IP. No bond. The second cable is optional later. LACP and VLANs are an optional later module.
- **Time:** chrony on all three nodes, peering with each other, in orphan mode (`local stratum 10 orphan`), so they keep one shared time with no internet source. Clocks matter: etcd leases and leader election, certificate validity (including the Kubernetes internal certificates), and point-in-time restore all depend on agreeing clocks.
- **SSH:** no root login, key-only. `admin` (sudo) and `operator` (read-only, no sudo).
- **CIMC:** change the default credentials on all three. Put CIMC on a management address that only `admin`'s machine can reach (a separate VLAN or a switch ACL once the switch module is applied). CIMC is the recovery path when SSH is lost.
- **Firewall:** only what the cluster and the app need. Automatic updates are off; OS patches arrive as an apt snapshot (section 11). Swap off.
- **Deploy verifier:** the baseline installs `deploy.sh`, `rollback.sh`, `backup-export` and the bundle signing public key to fixed paths on each node. The bundle never carries the tools that verify it.
- **Ansible:** installed only on the owner's computer, never on the servers. It connects over SSH, and the servers need only SSH and Python 3. A failed node is rebuilt by reinstalling Ubuntu and re-running the playbook. Ansible works offline once installed.

## 8. Cluster

- k3s, pinned version, air-gap install (binary plus air-gap image tarball). All 3 nodes are control-plane (embedded etcd) and run workloads.
- **k3s flags from the first install:** `--disable servicelb` (kube-vip provides load balancer IPs instead), `--tls-san <API VIP>` so the API certificate is valid on the VIP, secrets encryption at rest, and the etcd snapshot schedule below.
- **kube-vip** in ARP mode (no switch changes) holds the API VIP. The **kube-vip cloud provider** assigns LoadBalancer IPs from a configured range for the app and DNS VIPs.
- **Ingress:** the bundled Traefik, HTTP only (decision 3), run with 3 replicas spread across nodes. Its service uses `externalTrafficPolicy: Local` so client addresses are preserved for the allowlist.
- **Network:** flannel (the k3s default) plus k3s network policies. Only the API may reach Postgres.
- **Storage:** local volumes on the dedicated LVM volumes. Postgres and Garage replicate themselves, so no shared storage system.
- **No in-cluster registry.** `deploy` loads image tarballs onto each node.
- **No downtime on updates:** the API and web run 2 or more replicas each with anti-affinity across nodes, and a PodDisruptionBudget keeps at least one of each available during drains and rollouts.
- **etcd snapshots:** k3s takes scheduled etcd snapshots (every 6 hours, keeping 20) on each server node's local disk. A job copies them into Garage, and `backup-export` includes them. The "lose two nodes" drill restores from them.

## 9. Platform services

- **cert-manager:** required internally by the Barman Cloud Plugin, which uses it for TLS between the operator and the plugin. It runs a self-signed issuer for that purpose only; no certificate is shown to users in version 1.
- **CloudNativePG:** 3 instances (1 primary, 2 replicas), automatic failover. PostgreSQL major version 17, matching dev (`compose.yaml` uses `postgres:17-alpine`), from the official CloudNativePG PostgreSQL image pinned to an exact minor version. Data lives on the Postgres LVM volume, never in the container. Versions pinned at plan time and checked against the current docs then. As of 2026-10-06, in-tree Barman Cloud backups (`.spec.backup.barmanObjectStore`) are deprecated and will be removed in CloudNativePG 1.30. This design uses the **Barman Cloud Plugin** (an `ObjectStore` resource), which needs CloudNativePG 1.26 or newer (1.27 or newer recommended) and cert-manager. Its install manifest is normally fetched from GitHub, so it must be stored in the bundle.
- **Garage:** S3-compatible, 3 copies (one per node), on its own volume. It receives continuous WAL archiving and a daily base backup with 14-day retention, giving point-in-time restore, and it holds the etcd snapshot copies.
- **`backup-export`:** a manual command, installed by the baseline, that copies the latest base backup, the WAL needed to restore it, and the latest etcd snapshot to a mounted USB disk as plain files. It has no schedule and no staleness alert (decision 4).
- **`health-check` (version 1, instead of monitoring):** a command installed by the baseline that prints OK or FAIL for: all nodes Ready and 3 etcd members; Postgres primary plus 2 standbys in sync; last successful backup under 26 hours old; last etcd snapshot under 7 hours old; every volume under 80% full; `GET /api/health` answering through the app VIP. The owner runs it regularly and before any change; `deploy` runs it as its preflight. Risk accepted until monitoring arrives: a failure is only noticed when someone runs it. No log stack in version 1 (`kubectl logs`).
- **Monitoring (deferred):** Prometheus, Alertmanager and Grafana, 15-day retention, alerting on the same items as `health-check` plus certificate expiry. Grafana's plugin auto-install and update checks turned off.
- **DNS:** a dedicated CoreDNS deployment (separate from the cluster's internal CoreDNS, same image, which is already in the k3s air-gap files), 2 replicas with anti-affinity, on its own LoadBalancer VIP. Records (for example `nettop.lan` and `nettop-test.lan` pointing to the app VIP) live in a ConfigMap in the chart and change through the bundle. There is no web interface. Nodes do not depend on it.
- **Access restriction (decision 5):** a Traefik IP allowlist on the app's route, listing the workstations that may use the app. A switch ACL can be added later with the switch module.
- All charts and images are pinned and shipped in the bundle.

## 10. Release bundle and deploy

`nettop-release-<version>.tar` contains `manifest.json` (version, git commit, SHA-256 of every file), `manifest.json.minisig`, `images/` (API and web, plus platform images only when they change), `charts/` (app and platform Helm charts, plus the plugin manifest), `k3s/` (only when upgrading), `ansible/` (the playbooks matching this release), and `RELEASE-NOTES.md`. It holds no source code, no secrets, no private keys, and no deploy tooling.

- **Signing:** `minisign`. The private key lives on the owner's computer, encrypted with a passphrase, with a backup copy on a USB disk stored in the secured room. The public key is installed on the nodes by the baseline playbook.
- **Key rotation:** generate a new key pair, add the new public key to the baseline and re-run it (the nodes accept both keys for one release), sign the next bundle with the new key, then remove the old public key with another baseline run.
- **`make release`** (on the owner's computer) runs the tests and the checks in section 13, builds the images, packages everything, and signs it.
- **`deploy`** (installed on each node) runs:
  1. Verify the signature and every checksum.
  2. Preflight: all nodes ready, disk space, the most recent backup succeeded.
  3. Load the images onto every node.
  4. Take an on-demand database backup, then run the migration job.
  5. Roll the app out one replica at a time, waiting for readiness.
  6. Run a smoke test (`GET /api/health` through the ingress) and record the release.

  Every step is safe to re-run. A failure stops the run with the old version still serving and prints the next action.
- **Transports:** USB (copy to a node, run `deploy`) and `deploy --push` from the laptop over SSH. Same script.
- **Rollback:** `deploy --rollback` returns the app to the previous release. Rule: every migration must work with both the new and the previous app version. A bad migration is fixed by restoring the pre-migration backup.
- **Updating the tooling:** changes to `deploy.sh` or the public key arrive only through a baseline playbook run from the owner's computer, never through a bundle.
- Nodes keep the images of the last 3 releases.

## 10a. Environments

| Environment | Where | Database | Address |
|---|---|---|---|
| dev | Owner's Mac (`docker compose`, `npm run dev`) | local Postgres | localhost |
| test | Cluster, namespace `nettop-test` | CloudNativePG, 1 instance, no backups of its own | `nettop-test.lan` |
| prod | Cluster, namespace `nettop-prod` | CloudNativePG, 3 instances, backups to Garage | `nettop.lan` |

- **Promotion:** `deploy --env test` installs a bundle in test; `deploy --env prod` installs the same file in prod. A bundle is never rebuilt between test and prod. `deploy --env prod` refuses a bundle version that has not been deployed to test.
- **Isolation:** test has a ResourceQuota and lower resource limits, so it cannot starve prod. Network policies keep test pods from reaching the prod database.
- **Test data:** a `refresh-test` command recreates the test database from the latest prod backup (point-in-time restore into `nettop-test`). Each refresh is also a restore check. `db seed` never runs in any cluster environment.
- **Limit:** test and prod share the platform. Platform changes (k3s, CloudNativePG, the plugin, cert-manager, OS patches) cannot be staged in test; they are rehearsed first on a single-node k3s VM on the owner's Mac (about 6 GiB), with the internet blocked.

## 11. OS patching

The bundle carries no OS packages, so patches use a separate path.

- **Patch snapshot:** on the owner's computer, an Ubuntu 24.04 container runs `aptly` to mirror `noble`, `noble-updates` and `noble-security` for amd64, filtered to the packages installed on the nodes and their dependencies. The snapshot is published as a static file tree, signed with an aptly GPG key whose public key the baseline installs.
- **Transport:** the snapshot travels on USB as its own signed archive, separate from the release bundle, on a schedule (for example monthly) or after an urgent security fix.
- **Rolling patch procedure**, one node at a time, run from Ansible:
  1. Check that the cluster is healthy and all Postgres replicas are in sync.
  2. `kubectl drain` the node (the PodDisruptionBudgets keep the app up; CloudNativePG moves the primary away if needed).
  3. Point apt at the snapshot, `apt upgrade`.
  4. Reboot.
  5. Wait for the node to rejoin and be ready, `kubectl uncordon`, wait for Postgres replicas to catch up.
  6. Continue with the next node.
- Kernel and k3s upgrades follow the same rolling procedure.

## 12. Secrets inventory

| Secret | Created by | Lives in | Backed up | Rotated |
|---|---|---|---|---|
| Postgres superuser and app user passwords | CloudNativePG at cluster creation | Kubernetes secrets (encrypted at rest in etcd) | etcd snapshots | CloudNativePG password change; the app pods restart to pick it up |
| Garage access keys | Install step, generated | Kubernetes secrets | etcd snapshots; also in the owner's offline record | Create a new key, update the ObjectStore secret, delete the old key |
| Barman Cloud Plugin TLS | cert-manager | Kubernetes secrets | not needed (re-issued automatically) | Automatic |
| Bundle signing key (minisign) | Owner, on their computer | Owner's computer (passphrase-encrypted) | USB in the secured room | Section 10 |
| aptly GPG key | Owner, on their computer | Owner's computer | USB in the secured room | New key, baseline installs the new public key |
| Grafana admin password | Install step, generated | Kubernetes secret | etcd snapshots; owner's offline record | Changed in Grafana, secret updated |
| k3s join token | First server install | `/var/lib/rancher/k3s/server/token` on each server | etcd snapshot restores need it: owner's offline record | `k3s token rotate` |
| SSH keys (`admin`, `operator`) | Owner | Owner's computer; public halves on nodes | USB in the secured room | Baseline run with new public keys |
| CIMC credentials | Owner | Owner's offline record | — | Changed in CIMC |
| HTTPS root and intermediate CA keys | Not in version 1 (decision 3) | — | — | — |

"Owner's offline record" is an encrypted file (for example a KeePassXC database) on the owner's computer, with a copy on the USB in the secured room.

## 13. Rehearsal, checks and acceptance

- **VM rehearsal (mandatory for pieces 1 to 6):** one of the three servers is reinstalled first with Ubuntu 24.04 and used temporarily as a KVM/libvirt host running three VMs (about 8 GiB RAM and 4 vCPU each, amd64). The VMs sit on an isolated libvirt network with no route to the internet; bundles reach them by copy from the host. Snapshots are taken before risky steps. The host is wiped before Phase B. The build machine is an Intel Mac (x86_64), so images are built for amd64 only.
- **Final run:** Phase B on the three real servers repeats the rehearsed install on real hardware, RAID and network.
- **Drills**, each a runbook signed off once: power off a node; kill the Postgres primary; reinstall a node and rejoin; point-in-time restore into a separate namespace; a bundle with a bad checksum or signature is refused; a failing migration leaves the old version serving; fill the Garage volume; lose two nodes and recover from an etcd snapshot; a rolling OS patch with the app staying up.
- **Automated checks in `make release`:** `ansible-lint`, `shellcheck`, `helm lint` and rendered-manifest validation, a check that no rendered manifest references an external registry or contains `seed`, and `deploy` tests against a fake bundle.
- **Acceptance checklist** (in `docs/`) before go-live on the real servers: all drills done; an update applied with no internet dependency; a restore proven; a `backup-export` done; no CDN calls in the frontend; nothing depends on the Phase A uplink (DNS upstream, time source, default route); CIMC credentials changed.

## 14. Decisions needed first

These shape the plans and must be settled before the piece that depends on them.

- ~~Build machine architecture~~ Resolved 2026-10-06: Intel Mac, x86_64; amd64 only.
- ~~Rehearsal location~~ Resolved 2026-10-06: one real server as a temporary VM host (section 13).
- **RAID 1 method** (before piece 2's real-server step): whether the MegaRAID SAS3516 offers hardware RAID 1 for these two SSDs, or a Linux software mirror is used.
- **Confirm all three servers are identical** (before piece 7), with `inxi -Fxz` on each.

## 15. Open items (do not block planning)

- Production IP plan: subnet, three node IPs, the API VIP, and the LoadBalancer range for the app and DNS VIPs. Held as variables in one file. Proposed starting point: `10.9.128.0/24`, nodes `.31` to `.33`, API VIP `.40`, LoadBalancer range `.41` to `.42`. Check for conflicts with the ISE lab.
- The app's DNS names, and how workstations learn the DNS VIP (manual or DHCP).
- The workstation allowlist (decision 5).
- Alert delivery on a closed network (Grafana only, or an internal mail server).
