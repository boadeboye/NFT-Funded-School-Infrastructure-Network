;; Fund-Releaser.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROJECT-NOT-FOUND u101)
(define-constant ERR-MILESTONE-NOT-FOUND u102)
(define-constant ERR-MILESTONE-NOT-APPROVED u103)
(define-constant ERR-INSUFFICIENT-FUNDS u104)
(define-constant ERR-ALREADY-RELEASED u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-PAUSED u107)
(define-constant ERR-INVALID-RECIPIENT u108)
(define-constant ERR-CONTRACT-NOT-SET u109)

(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var funding-pool-contract (optional principal) none)
(define-data-var milestone-tracker-contract (optional principal) none)
(define-data-var oracle-verifier-contract (optional principal) none)

(define-map projects
  uint
  {
    recipient: principal,
    total-budget: uint,
    released-amount: uint,
    milestone-count: uint,
    status: (string-ascii 20)
  }
)

(define-map milestones
  { project-id: uint, milestone-id: uint }
  {
    amount: uint,
    approved: bool,
    released: bool,
    proof-hash: (buff 32)
  }
)

(define-map project-paused uint bool)

(define-read-only (get-project (project-id uint))
  (map-get? projects project-id)
)

(define-read-only (get-milestone (project-id uint) (milestone-id uint))
  (map-get? milestones { project-id: project-id, milestone-id: milestone-id })
)

(define-read-only (is-project-paused (project-id uint))
  (default-to false (map-get? project-paused project-id))
)

(define-read-only (get-contract-address (contract-name (string-ascii 20)))
  (match contract-name
    "funding-pool" (var-get funding-pool-contract)
    "milestone-tracker" (var-get milestone-tracker-contract)
    "oracle-verifier" (var-get oracle-verifier-contract)
    none
  )
)

(define-public (set-contract (contract-name (string-ascii 20)) (address principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (match contract-name
      "funding-pool" (var-set funding-pool-contract (some address))
      "milestone-tracker" (var-set milestone-tracker-contract (some address))
      "oracle-verifier" (var-set oracle-verifier-contract (some address))
      (err ERR-INVALID-RECIPIENT)
    )
    (ok true)
  )
)

(define-public (initialize-project
  (project-id uint)
  (recipient principal)
  (total-budget uint)
  (milestone-count uint)
)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> recipient tx-sender) (err ERR-INVALID-RECIPIENT))
    (asserts! (> total-budget u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> milestone-count u0) (err ERR-INVALID-AMOUNT))
    (map-set projects project-id
      {
        recipient: recipient,
        total-budget: total-budget,
        released-amount: u0,
        milestone-count: milestone-count,
        status: "active"
      }
    )
    (ok true)
  )
)

(define-public (add-milestone
  (project-id uint)
  (milestone-id uint)
  (amount uint)
  (proof-hash (buff 32))
)
  (let ((project (unwrap! (get-project project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-some (get-milestone project-id milestone-id))) (err ERR-MILESTONE-NOT-FOUND))
    (map-set milestones
      { project-id: project-id, milestone-id: milestone-id }
      {
        amount: amount,
        approved: false,
        released: false,
        proof-hash: proof-hash
      }
    )
    (ok true)
  )
)

(define-public (approve-milestone (project-id uint) (milestone-id uint))
  (let (
    (milestone (unwrap! (get-milestone project-id milestone-id) (err ERR-MILESTONE-NOT-FOUND)))
    (tracker (unwrap! (var-get milestone-tracker-contract) (err ERR-CONTRACT-NOT-SET)))
  )
    (asserts! (is-eq contract-caller tracker) (err ERR-NOT-AUTHORIZED))
    (map-set milestones
      { project-id: project-id, milestone-id: milestone-id }
      (merge milestone { approved: true })
    )
    (ok true)
  )
)

(define-public (release-funds (project-id uint) (milestone-id uint))
  (let (
    (project (unwrap! (get-project project-id) (err ERR-PROJECT-NOT-FOUND)))
    (milestone (unwrap! (get-milestone project-id milestone-id) (err ERR-MILESTONE-NOT-FOUND)))
    (pool (unwrap! (var-get funding-pool-contract) (err ERR-CONTRACT-NOT-SET)))
    (oracle (unwrap! (var-get oracle-verifier-contract) (err ERR-CONTRACT-NOT-SET)))
  )
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (not (default-to false (map-get? project-paused project-id))) (err ERR-PAUSED))
    (asserts! (get approved milestone) (err ERR-MILESTONE-NOT-APPROVED))
    (asserts! (not (get released milestone)) (err ERR-ALREADY-RELEASED))
    (try! (as-contract (contract-call? pool request-withdrawal project-id (get amount milestone) (get recipient project))))
    (map-set milestones
      { project-id: project-id, milestone-id: milestone-id }
      (merge milestone { released: true })
    )
    (map-set projects project-id
      (merge project { released-amount: (+ (get released-amount project) (get amount milestone)) })
    )
    (ok (get amount milestone))
  )
)

(define-public (pause-project (project-id uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (map-set project-paused project-id true)
    (ok true)
  )
)

(define-public (unpause-project (project-id uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (map-delete project-paused project-id)
    (ok true)
  )
)

(define-public (emergency-withdraw (project-id uint) (amount uint))
  (let ((project (unwrap! (get-project project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= amount (- (get total-budget project) (get released-amount project))) (err ERR-INSUFFICIENT-FUNDS))
    (try! (as-contract (contract-call? (unwrap! (var-get funding-pool-contract) (err ERR-CONTRACT-NOT-SET)) emergency-transfer amount (get recipient project))))
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (toggle-global-pause)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set paused (not (var-get paused)))
    (ok (var-get paused))
  )
)