# Algorithm Report: Indoor Positioning for Attendance Verification

## 1. Introduction

This report describes the indoor positioning algorithms implemented in this research platform. The goal is to evaluate multiple approaches, from simple GPS checks to advanced robust statistical methods, and compare their accuracy for indoor attendance verification.

**Key challenge**: GPS was designed for outdoor use. Indoors, satellite signals are reflected (multipath), attenuated, or blocked entirely, leading to accuracy degradation from 3-5 meters (best case outdoor) to 20-100+ meters (typical indoor).

---

## 2. GPS Limitations for Indoor Positioning

### 2.1 Signal Degradation
- **Multipath**: GPS signals bounce off walls, floors, and ceilings before reaching the receiver, causing range measurement errors
- **Attenuation**: Building materials (concrete, steel, glass) weaken satellite signals
- **Reduced satellite visibility**: Indoor environments block line-of-sight to most satellites, reducing geometric dilution of precision (GDOP)

### 2.2 Typical Indoor GPS Accuracy
| Environment | Accuracy (95th percentile) |
|-------------|---------------------------|
| Open sky | 3–5 m |
| Urban canyon | 10–25 m |
| Indoor (window) | 20–50 m |
| Indoor (deep) | 50–100+ m or unavailable |

### 2.3 Smartphone GPS Characteristics
Modern smartphones use **Assisted GPS (A-GPS)** and **WiFi/cell tower triangulation** to improve time-to-first-fix and accuracy. The browser Geolocation API provides an `accuracy` field (radius in meters, 68% confidence level).

---

## 3. Algorithms Implemented

### 3.1 Algorithm 1: Baseline GPS

**Idea**: Take the most recent GPS reading and check if it falls inside the room polygon.

**Method**:
1. Use the latest `GeolocationPosition` from the browser
2. Apply ray-casting point-in-polygon test
3. If outside polygon, check buffer zone (Haversine distance to room center)

**Confidence scoring**:
$$C = 0.6 \cdot \max\left(0, 1 - \frac{accuracy}{100}\right) + 0.4 \cdot \max\left(0, 1 - \frac{d_{center}}{3 \cdot r_{buffer}}\right)$$

**Pros**:
- Zero latency — instant result
- No sample collection needed

**Cons**:
- Single noisy reading → very unreliable indoors
- No noise filtering or outlier rejection
- Accuracy depends entirely on the current GPS fix quality

---

### 3.2 Algorithm 2: Sliding Window + Centroid

**Idea**: Collect multiple GPS samples, filter by accuracy, compute the geometric center (centroid), and use that for the polygon check.

**Method**:
1. Collect $N$ samples (default: 12)
2. Filter: keep only samples with accuracy $\leq \theta_{acc}$ (default: 50m)
3. Compute centroid:
$$\bar{p} = \frac{1}{|S|} \sum_{i \in S} p_i$$
4. Point-in-polygon check with buffer

**Confidence scoring** combines three factors:
$$C = 0.3 \cdot r_{sample} + 0.4 \cdot \left(1 - \frac{\bar{a}}{100}\right) + 0.3 \cdot \left(1 - \frac{d_{center}}{3 \cdot r_{buffer}}\right)$$

where $r_{sample}$ is the ratio of samples passing the accuracy filter, and $\bar{a}$ is their average accuracy.

**Pros**:
- Averaging reduces random noise (by $\sqrt{N}$ for i.i.d. errors)
- Accuracy filtering removes clearly bad samples

**Cons**:
- Requires time to collect samples (~10 seconds)
- Systematic bias (all readings shifted in one direction) is NOT corrected
- Simple mean is sensitive to outliers

---

### 3.3 Algorithm 3: Kalman Filter

**Idea**: Use a standard 2D Kalman filter to track position over time, modeling the user as approximately stationary or moving with constant velocity.

**State Model**:

State vector: $\mathbf{x} = [lat, lng, v_{lat}, v_{lng}]^T$

State transition (constant velocity model):
$$\mathbf{x}_{k} = \mathbf{F} \cdot \mathbf{x}_{k-1} + \mathbf{w}_k$$

$$\mathbf{F} = \begin{bmatrix} 1 & 0 & \Delta t & 0 \\ 0 & 1 & 0 & \Delta t \\ 0 & 0 & 1 & 0 \\ 0 & 0 & 0 & 1 \end{bmatrix}$$

Observation model (we observe lat, lng only):
$$\mathbf{z}_k = \mathbf{H} \cdot \mathbf{x}_k + \mathbf{v}_k, \quad \mathbf{H} = \begin{bmatrix} 1 & 0 & 0 & 0 \\ 0 & 1 & 0 & 0 \end{bmatrix}$$

Measurement noise: $\mathbf{R}_k = \text{diag}(\sigma_{lat}^2, \sigma_{lng}^2)$ where $\sigma$ is derived from the GPS accuracy field.

**Kalman update equations**:

Predict:
$$\hat{\mathbf{x}}_k^- = \mathbf{F} \hat{\mathbf{x}}_{k-1}$$
$$\mathbf{P}_k^- = \mathbf{F} \mathbf{P}_{k-1} \mathbf{F}^T + \mathbf{Q}$$

Update:
$$\mathbf{K}_k = \mathbf{P}_k^- \mathbf{H}^T (\mathbf{H} \mathbf{P}_k^- \mathbf{H}^T + \mathbf{R}_k)^{-1}$$
$$\hat{\mathbf{x}}_k = \hat{\mathbf{x}}_k^- + \mathbf{K}_k (\mathbf{z}_k - \mathbf{H} \hat{\mathbf{x}}_k^-)$$
$$\mathbf{P}_k = (\mathbf{I} - \mathbf{K}_k \mathbf{H}) \mathbf{P}_k^-$$

**Pros**:
- Optimal filter for linear Gaussian systems
- Models velocity → better prediction
- Naturally handles variable measurement quality (through $\mathbf{R}_k$)
- Final state covariance $\mathbf{P}$ provides uncertainty estimate

**Cons**:
- Assumes Gaussian noise — multipath errors are often **non-Gaussian**
- Sensitive to process noise $\mathbf{Q}$ tuning
- Can be slow to converge if first few samples are poor

---

### 3.4 Algorithm 4: Z-Score + IRLS + Huber Loss (Advanced Pipeline)

**Idea**: A robust statistical estimator that explicitly handles outliers through a two-stage pipeline.

**Stage 1: Z-Score Filtering**

Remove gross outliers before the main estimation.

1. Compute preliminary centroid $\bar{p}$
2. For each sample $i$, compute distance $d_i = \|\|p_i - \bar{p}\|\|$
3. Compute mean $\mu_d$ and standard deviation $\sigma_d$ of distances
4. Remove samples where $|z_i| = |(d_i - \mu_d) / \sigma_d| > 2.0$

**Stage 2: IRLS with Huber Loss**

Iteratively Reweighted Least Squares finds the position that minimizes:
$$\hat{p}^* = \arg\min_p \sum_i w_i \cdot \rho_H(\|p_i - p\|)$$

where:
- $w_i = 1 / \text{accuracy}_i^2$ (base weight: higher accuracy → higher weight)
- $\rho_H(r)$ is the Huber loss with threshold $\delta = 3$m:

$$\rho_H(r) = \begin{cases} \frac{r^2}{2} & \text{if } |r| \leq \delta \\ \delta \left(|r| - \frac{\delta}{2}\right) & \text{if } |r| > \delta \end{cases}$$

The Huber loss behaves quadratically for small residuals (like least squares) but linearly for large residuals (reducing the influence of outliers).

**IRLS weight function** for Huber loss:
$$w_{H}(r) = \begin{cases} 1 & \text{if } |r| \leq \delta \\ \delta / |r| & \text{if } |r| > \delta \end{cases}$$

**Algorithm**:
1. Initialize: $\hat{p}^{(0)}$ = accuracy-weighted centroid
2. For each iteration $t$:
   a. Compute residuals: $r_i^{(t)} = \|p_i - \hat{p}^{(t)}\|$
   b. Compute IRLS weights: $\tilde{w}_i = w_i \cdot w_H(r_i^{(t)})$
   c. Update estimate: $\hat{p}^{(t+1)} = \frac{\sum_i \tilde{w}_i \cdot p_i}{\sum_i \tilde{w}_i}$
   d. If $\|\hat{p}^{(t+1)} - \hat{p}^{(t)}\| < \epsilon$, stop
3. Maximum 20 iterations, $\epsilon = 0.1$m

**Confidence scoring** uses the effective sample size (ESS):
$$\text{ESS} = \frac{(\sum_i w_i)^2}{\sum_i w_i^2}$$

A high ESS means samples have similar weights → good agreement.

**Pros**:
- Very robust to outliers (Huber loss + Z-score pre-filtering)
- Principled statistical framework with convergence guarantees
- Naturally weights by GPS accuracy

**Cons**:
- Requires sufficient samples (≥ 5–10)
- More complex to implement and debug
- Huber delta $\delta$ needs tuning for the environment

---

### 3.5 Algorithm 5: Hybrid Approach

**Idea**: Combine multiple signals — IRLS-Huber position, Kalman smoothed position, movement stability, and WiFi approximation — into a single robust decision.

**Components**:

1. **Position fusion**: Weighted combination of IRLS and Kalman positions
   - Stationary user → weight IRLS more (70/30)
   - Moving user → weight Kalman more (better velocity tracking)

2. **Spatial variance** (stability measure):
$$\sigma^2_{spatial} = \frac{1}{N} \sum_i (d_i - \bar{d})^2$$
where $d_i$ is the distance of each sample from the centroid. Low variance = stationary.

3. **Temporal stability**: Compare centroids of first-half vs second-half samples. Low drift = high stability.

4. **WiFi confidence** (simulated): In a real deployment, this would use WiFi RSSI fingerprinting. Currently simulated based on GPS accuracy patterns.

5. **High-confidence heuristic**:
$$\text{IF } \sigma^2_{spatial} < 100m^2 \text{ AND } r_{good} > 0.5 \text{ AND } s_{temporal} > 0.6$$
$$\text{THEN boost confidence by 20\%}$$

**Final confidence**:
$$C = w_1 \cdot C_{position} + w_2 \cdot s_{stability} + w_3 \cdot r_{accuracy} + w_4 \cdot C_{wifi}$$

**Pros**:
- Best overall accuracy by combining complementary signals
- Adapts to user behavior (stationary vs moving)
- High-confidence mode provides reliable "yes/no" decisions

**Cons**:
- Most complex algorithm
- WiFi component is simulated (needs real fingerprint data)
- Many hyperparameters to tune

---

## 4. Geometric Utilities

### 4.1 Haversine Distance

Distance between two points on Earth's surface:
$$d = 2R \cdot \arctan2\left(\sqrt{a}, \sqrt{1-a}\right)$$
$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1 \cos\phi_2 \sin^2\left(\frac{\Delta\lambda}{2}\right)$$

### 4.2 Ray-Casting Point-in-Polygon

Counts the number of times a horizontal ray from the test point crosses polygon edges. Odd crossings = inside.

### 4.3 Buffer Zone Check

If a point is outside the polygon, it may still be "close enough". We check:
$$d(p, center) \leq r_{buffer}$$

This accounts for GPS inaccuracy near room boundaries.

---

## 5. Why the Hybrid Approach is Better

| Aspect | Baseline | Centroid | Kalman | IRLS+Huber | Hybrid |
|--------|----------|----------|--------|------------|--------|
| Noise reduction | None | √N averaging | Recursive filtering | Robust weighting | All combined |
| Outlier handling | None | Accuracy filter | Somewhat (via R) | Z-score + Huber | Full pipeline |
| Velocity model | No | No | Yes | No | Via Kalman |
| Confidence | Basic | Basic | From covariance | From ESS | Multi-factor |
| Indoor suitability | Poor | Fair | Good | Very Good | Best |

The Hybrid approach is superior because:

1. **It combines strengths**: IRLS handles outliers, Kalman tracks dynamics
2. **Adaptive weighting**: Automatically adjusts based on whether the user is stationary or moving
3. **Multiple validation signals**: Cross-checks GPS with stability metrics
4. **Calibrated confidence**: Fuses multiple confidence estimates for a more reliable overall score

---

## 6. Known Limitations

1. **All approaches ultimately depend on GPS** — if GPS is completely unavailable, none will work
2. **WiFi fingerprinting is simulated** — real WiFi-based positioning requires a training phase with known positions
3. **No floor detection** — all algorithms operate in 2D (lat/lng only)
4. **Huber delta and other parameters** are set to reasonable defaults but should be tuned per environment
5. **Ground truth is subjective** — user feedback ("were you inside?") may have errors

---

## 7. Recommendations for Research

1. **Collect 50+ samples per room** with ground truth for meaningful statistics
2. **Test in different buildings** with varying materials and sizes
3. **Compare accuracy degradation** as buffer radius increases (trade-off: more true positives but also more false positives)
4. **Vary the number of GPS samples** (5, 10, 15, 20) to find the sweet spot between latency and accuracy
5. **Record environmental conditions**: time of day, floor level, proximity to windows
