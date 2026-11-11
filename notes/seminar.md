# Seminar on Emerging Technologies — Unit Assessment notes

> **Important:** this is a **theory subject** like the others — two Unit Assessments (30 marks each), plus Thematic Assessment and ERLA. **UA-2 is on 25 November** (time to be announced). Questions may be asked from the 15 topics below. Short, exam-ready answers — expand with your own examples.

**Answer formula that works for every question:** Definition → How it works (2–3 points) → Applications (3–4) → Advantages/limitations → Example → Conclusion.

---

## Q1. What are emerging technologies? Their role in transforming industries
**Definition:** New or rapidly developing technologies whose impact is still growing and which are expected to change how industries and society work. Features: **novelty, fast growth, coherence, big impact, uncertainty**.

**Examples:** AI/GenAI, IoT, blockchain, cloud & edge computing, 5G, quantum computing, AR/VR, robotics, biotech.

**Role in industries**
- **Healthcare:** AI diagnosis, telemedicine, wearables.
- **Finance:** UPI, fraud detection with ML, blockchain settlements.
- **Manufacturing (Industry 4.0):** smart factories, predictive maintenance, digital twins.
- **Agriculture:** drones, soil sensors, crop prediction.
- **Education:** online platforms, AI tutors.
- **Retail:** recommendations, cashierless stores.

**Conclusion:** they increase efficiency, create new business models, but need skills, regulation and ethics.

## Q2. Artificial Intelligence — applications and limitations
**AI:** the ability of machines to perform tasks that normally need human intelligence — learning, reasoning, perception, language. Types: **Narrow AI** (one task, all current systems) vs **General AI** (hypothetical human-level).

**Applications:** virtual assistants, face recognition, medical image analysis, self-driving, fraud detection, recommendation systems, chatbots, language translation.

**Limitations:** needs huge data · **bias** from training data · lack of explainability ("black box") · high compute/energy cost · privacy issues · can make confident mistakes · job displacement · no real common sense.

## Q3. Generative AI in education and industry
**GenAI:** AI that **creates new content** (text, images, audio, code, video) by learning patterns from large datasets. Built on **transformers / Large Language Models** (e.g. GPT, Gemini, Claude) and **diffusion models** (images).

**Education:** personalised tutoring, doubt solving 24×7, generating quizzes and notes, language learning, accessibility (text-to-speech), helping teachers with lesson plans.
**Industry:** content and marketing, code generation, customer-support chatbots, product design, drug discovery, document summarisation.
**Concerns:** hallucinations (made-up facts), plagiarism and academic integrity, copyright, deepfakes, bias, data privacy.

## Q4. Machine Learning — supervised vs unsupervised
**ML:** a branch of AI where systems **learn patterns from data** and improve with experience instead of being explicitly programmed.

| Basis | Supervised | Unsupervised |
|---|---|---|
| Data | **Labelled** (input + correct output) | **Unlabelled** |
| Goal | Predict output for new input | Find hidden structure/patterns |
| Tasks | Classification, regression | Clustering, association, dimensionality reduction |
| Algorithms | Linear/logistic regression, decision tree, SVM, k-NN | k-Means, hierarchical clustering, PCA, Apriori |
| Example | Spam vs not-spam email | Customer segmentation |
| Evaluation | Accuracy, precision, RMSE | Harder (silhouette score etc.) |

Mention also: **reinforcement learning** (agent learns by rewards — game playing, robotics).

## Q5. IoT — smart homes and smart cities
**IoT:** a network of physical devices with **sensors, software and connectivity** that collect and exchange data over the internet. Layers: **perception (sensors) → network → processing/cloud → application**.

**Smart homes:** smart lights and ACs, voice assistants, smart locks and CCTV, smart meters, appliance automation, elderly fall detection.
**Smart cities:** smart traffic signals, smart parking, waste-bin sensors, air-quality monitoring, smart street lights, water leakage detection, public safety cameras (India's **Smart Cities Mission**).
**Challenges:** security of weak devices, privacy, interoperability, power, network reliability.

## Q6. Cloud computing and its service models
**Cloud computing:** on-demand delivery of computing resources (servers, storage, databases, software) over the internet with **pay-as-you-go** pricing.
**Characteristics:** on-demand self-service, broad network access, resource pooling, rapid elasticity, measured service.

| Model | What you get | Example |
|---|---|---|
| **IaaS** | Virtual machines, storage, networks | AWS EC2, Azure VMs |
| **PaaS** | Platform to build & deploy apps | Google App Engine, Heroku |
| **SaaS** | Ready-to-use software | Gmail, Microsoft 365, Zoom |

**Deployment:** public, private, hybrid, community. **Benefits:** low upfront cost, scalability, anywhere access, backups. **Issues:** security, downtime, vendor lock-in.

## Q7. Edge computing vs cloud computing
**Edge computing:** processing data **close to where it is generated** (on the device or a nearby edge server) instead of a far-away cloud data centre.

| Basis | Cloud computing | Edge computing |
|---|---|---|
| Location of processing | Centralised data centres | Near the data source |
| Latency | Higher | Very low |
| Bandwidth use | High (all data sent) | Low (only results sent) |
| Best for | Heavy storage, big analytics, training models | Real-time decisions |
| Internet dependency | Needs constant connectivity | Can work offline |
| Example | Google Drive, model training | Self-driving cars, smart cameras, factory robots |

They work **together**: edge for instant decisions, cloud for storage and deep analysis.

## Q8. Blockchain — working and applications
**Blockchain:** a **decentralised, distributed, immutable ledger** where records (transactions) are stored in blocks linked by cryptographic hashes.

**Working**
1. A transaction is requested and broadcast to the network (nodes).
2. Nodes validate it.
3. Valid transactions are grouped into a **block**.
4. Block is added through a **consensus mechanism** (Proof of Work / Proof of Stake).
5. Each block stores the **hash of the previous block** → changing one block breaks the chain, so data is tamper-proof.

**Applications:** cryptocurrency (Bitcoin), supply-chain tracking, land records, digital certificates, voting, healthcare records, **smart contracts** (Ethereum), cross-border payments.
**Limitations:** scalability, energy use (PoW), regulation, irreversible mistakes.

## Q9. Cybersecurity and common cyber threats
**Cybersecurity:** protecting systems, networks and data from attacks, damage or unauthorised access. Goals: **CIA triad — Confidentiality, Integrity, Availability**.

**Common threats**
- **Malware:** viruses, worms, trojans, spyware.
- **Ransomware:** encrypts files, demands payment (e.g. WannaCry 2017).
- **Phishing:** fake emails/SMS/links to steal credentials (very common UPI/OTP frauds in India).
- **DDoS:** flooding a server so it goes down.
- **Man-in-the-middle:** intercepting communication (public Wi-Fi).
- **SQL injection / XSS:** attacking web applications.
- **Social engineering & insider threats.**

**Prevention:** strong passwords + MFA, updates/patching, antivirus, firewalls, encryption, backups, user awareness. India: **CERT-In**, IT Act 2000, report fraud at **cybercrime.gov.in / 1930**.

## Q10. Big Data Analytics in decision-making
**Big data:** datasets too large or complex for traditional tools. **5 Vs: Volume, Velocity, Variety, Veracity, Value.**
**Big Data Analytics:** examining big data to find patterns, trends and insights. Types: **descriptive** (what happened), **diagnostic** (why), **predictive** (what will happen), **prescriptive** (what to do).
**Tools:** Hadoop, Spark, Hive, NoSQL, Tableau/Power BI.

**Importance in decisions:** data-driven instead of guesswork · customer insights and personalisation (Netflix, Amazon) · fraud detection in banks · demand forecasting · healthcare outbreak prediction · traffic and city planning · faster real-time decisions.

## Q11. 5G vs previous generations
**5G:** fifth-generation mobile network offering very high speed, ultra-low latency and massive device connectivity.

| Feature | 4G | 5G |
|---|---|---|
| Peak speed | ~100 Mbps–1 Gbps | Up to ~10–20 Gbps |
| Latency | ~30–50 ms | ~1–10 ms |
| Devices per km² | ~100,000 | Up to ~1 million |
| Key tech | OFDM, MIMO | Massive MIMO, mmWave, beamforming, network slicing |
| Use cases | Video streaming, apps | IoT, autonomous vehicles, remote surgery, AR/VR, smart factories |

**Generations recap:** 1G analog voice → 2G digital voice + SMS → 3G mobile internet → 4G broadband/video → 5G hyper-connectivity.
**Challenges:** costly infrastructure, short range of mmWave (needs many small cells), security.

## Q12. Quantum computing — concept and applications
**Classical bits** are 0 or 1. **Qubits** can be in a **superposition** of 0 and 1 at the same time.
**Key concepts:** **superposition** (many states at once) · **entanglement** (qubits linked so the state of one affects the other) · **interference** (amplify correct answers, cancel wrong ones) · measurement collapses the state.

**Applications:** drug discovery and molecule simulation · cryptography (Shor's algorithm could break RSA → need for **post-quantum cryptography**) · optimisation (logistics, finance) · AI/ML speed-ups · weather and materials science.
**Challenges:** qubits are fragile (decoherence), need near absolute-zero temperatures, high error rates. India: **National Quantum Mission (2023)**.

## Q13. Emerging technologies in healthcare and biological research
- **AI:** disease detection from X-rays/MRI, diabetic retinopathy screening, drug discovery; **AlphaFold** predicted 3D structures of proteins.
- **IoT & wearables:** heart-rate, SpO₂, glucose monitoring, remote patient monitoring.
- **Telemedicine:** e-Sanjeevani in India.
- **Big data & genomics:** personalised medicine, outbreak tracking.
- **Robotics:** robot-assisted surgery.
- **Blockchain:** secure health records.
- **CRISPR & biotech:** gene editing for genetic diseases.
- **3D printing:** prosthetics, implants.
**Issues:** data privacy, cost, regulation, biased datasets.

## Q14. Ethical and social challenges of AI and emerging technologies
- **Bias & discrimination** — unfair hiring/loan decisions from biased data.
- **Privacy & surveillance** — face recognition, data collection.
- **Job displacement** — automation of routine work; need for reskilling.
- **Misinformation & deepfakes** — fake videos, election manipulation.
- **Accountability** — who is responsible when AI fails (self-driving accident)?
- **Transparency** — black-box models.
- **Digital divide** — unequal access between rich and poor, urban and rural.
- **Security & misuse** — cyber weapons, autonomous weapons.
- **Environmental cost** — energy use of data centres and AI training.
**Solutions:** responsible-AI principles (fairness, transparency, accountability), regulation (EU AI Act, India's DPDP Act 2023), human oversight, AI literacy.

## Q15. One emerging technology in depth — template answer (Generative AI)
Use the structure: **working · applications · advantages · limitations · future scope.**
- **Working:** a transformer neural network is pre-trained on huge text data to predict the next token; then fine-tuned and aligned with human feedback; it generates answers token by token.
- **Applications:** chatbots, coding assistants, content creation, education, customer support, research summarisation.
- **Advantages:** productivity boost, 24×7 availability, personalisation, lowers skill barriers.
- **Limitations:** hallucination, bias, copyright questions, privacy, high compute cost, misuse (deepfakes, phishing).
- **Future scope:** AI agents that complete tasks, multimodal models (text + image + voice + video), on-device AI, domain-specific models (health, law), regulation and safety research.

*(You can swap in IoT, blockchain or quantum computing using the same five headings.)*
