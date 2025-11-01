(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROJECT-NOT-FOUND u101)
(define-constant ERR-MILESTONE-NOT-FOUND u102)
(define-constant ERR-ALREADY-APPROVED u103)
(define-constant ERR-INVALID-STATUS u104)
(define-constant ERR-INVALID-PROOF-HASH u105)
(define-constant ERR-NOT-ORACLE u106)
(define-constant ERR-NOT-RELEASER u107)

(define-data-var admin principal tx-sender)
(define-data-var fund-releaser-contract (optional principal) none)
(define-data-var oracle-verifier-contract (optional principal) none)

(define-map projects
  uint
  {
    project-id: uint,
    total-milestones: uint,
    approved-count: uint,
    status: (string-ascii 20),
    created-at: uint,
    updated-at: uint
  }
)

(define-map milestones
  { project-id: uint, milestone-id: uint }
  {
    title: (string-utf8 200),
    description: (string-utf8 1000),
    target-amount: uint,
    proof-hash: (buff 32),
    status: (string-ascii 20),
    submitted-at: uint,
    approved-at: (optional uint),
    submitter: principal
  }
)

(define-map project-oracles uint (list 10 principal))

(define-read-only (get-project (project-id uint))
  (map-get? projects project-id)
)

(define-read-only (get-milestone (project-id uint) (milestone-id uint))
  (map-get? milestones { project-id: project-id, milestone-id: milestone-id })
)

(define-read-only (get-project-oracles (project-id uint))
  (default-to (list) (map-get? project-oracles project-id))
)

(define-public (initialize-project
  (project-id uint)
  (total-milestones uint)
  (oracle-list (list 10 principal))
)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (get-project project-id)) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (> total-milestones u0) (err ERR-INVALID-STATUS))
    (asserts! (<= (len oracle-list) u10) (err ERR-INVALID-STATUS))
    (map-set projects project-id
      {
        project-id: project-id,
        total-milestones: total-milestones,
        approved-count: u0,
        status: "active",
        created-at: block-height,
        updated-at: block-height
      }
    )
    (map-set project-oracles project-id oracle-list)
    (ok true)
  )
)

(define-public (submit-milestone
  (project-id uint)
  (milestone-id uint)
  (title (string-utf8 200))
  (description (string-utf8 1000))
  (target-amount uint)
  (proof-hash (buff 32))
)
  (let ((project (unwrap! (get-project project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (get-milestone project-id milestone-id)) (err ERR-MILESTONE-NOT-FOUND))
    (asserts! (> target-amount u0) (err ERR-INVALID-STATUS))
    (asserts! (is-eq (len proof-hash) u32) (err ERR-INVALID-PROOF-HASH))
    (asserts! (< milestone-id (get total-milestones project)) (err ERR-INVALID-STATUS))
    (map-set milestones
      { project-id: project-id, milestone-id: milestone-id }
      {
        title: title,
        description: description,
        target-amount: target-amount,
        proof-hash: proof-hash,
        status: "submitted",
        submitted-at: block-height,
        approved-at: none,
        submitter: tx-sender
      }
    )
    (map-set projects project-id
      (merge project { updated-at: block-height })
    )
    (ok true)
  )
)

(define-public (oracle-approve
  (project-id uint)
  (milestone-id uint)
  (approval-proof-hash (buff 32))
)
  (let (
    (milestone (unwrap! (get-milestone project-id milestone-id) (err ERR-MILESTONE-NOT-FOUND)))
    (oracles (get-project-oracles project-id))
  )
    (asserts! (is-some (var-get oracle-verifier-contract)) (err ERR-NOT-ORACLE))
    (asserts! (is-eq contract-caller (unwrap! (var-get oracle-verifier-contract) (err ERR-NOT-ORACLE))) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status milestone) "submitted") (err ERR-INVALID-STATUS))
    (asserts! (is-eq (len approval-proof-hash) u32) (err ERR-INVALID-PROOF-HASH))
    (map-set milestones
      { project-id: project-id, milestone-id: milestone-id }
      (merge milestone
        {
          status: "oracle-verified",
          approved-at: (some block-height),
          proof-hash: approval-proof-hash
        }
      )
    )
    (ok true)
  )
)

(define-public (approve-milestone (project-id uint) (milestone-id uint))
  (let (
    (milestone (unwrap! (get-milestone project-id milestone-id) (err ERR-MILESTONE-NOT-FOUND)))
    (project (unwrap! (get-project project-id) (err ERR-PROJECT-NOT-FOUND)))
  )
    (asserts! (is-eq (get status milestone) "oracle-verified") (err ERR-INVALID-STATUS))
    (asserts! (is-some (var-get fund-releaser-contract)) (err ERR-NOT-RELEASER))
    (asserts! (is-eq contract-caller (unwrap! (var-get fund-releaser-contract) (err ERR-NOT-RELEASER))) (err ERR-NOT-AUTHORIZED))
    (map-set milestones
      { project-id: project-id, milestone-id: milestone-id }
      (merge milestone { status: "approved" })
    )
    (map-set projects project-id
      (merge project
        {
          approved-count: (+ (get approved-count project) u1),
          updated-at: block-height
        }
      )
    )
    (ok true)
  )
)

(define-public (set-fund-releaser (releaser principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set fund-releaser-contract (some releaser))
    (ok true)
  )
)

(define-public (set-oracle-verifier (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-verifier-contract (some oracle))
    (ok true)
  )
)

(define-public (update-project-status (project-id uint) (new-status (string-ascii 20)))
  (let ((project (unwrap! (get-project project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (or
      (is-eq new-status "active")
      (is-eq new-status "completed")
      (is-eq new-status "cancelled")
    ) (err ERR-INVALID-STATUS))
    (map-set projects project-id
      (merge project
        {
          status: new-status,
          updated-at: block-height
        }
      )
    )
    (ok true)
  )
)

(define-read-only (is-milestone-approved (project-id uint) (milestone-id uint))
  (match (get-milestone project-id milestone-id)
    m (is-eq (get status m) "approved")
    false
  )
)