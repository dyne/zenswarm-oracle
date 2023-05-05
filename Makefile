RR_PORT := 443
RR_HOST := did.dyne.org
RR_SCHEMA := https

SECRET := secrets
KEYS := keys.json

CONTAINER := zenswarm-oracle

help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' Makefile

##@ Oracle management
keygen: ## Generate a new oracle keyring [DESCRIPTION]
	$(if $(value DESCRIPTION), ,$(error Enter the final description that will be present in yout DID doc as DESCRIPTION="<description>"))
	@[ -d ${SECRET} ] || mkdir ${SECRET} ;\
	if [ -f ${SECRET}/${KEYS} ]; then printf "Delete the old ${SECRET}/${KEYS} file\n"; exit 1; fi ;\
	tmp=$$(mktemp) ;\
	echo "{\"controller\": \"${DESCRIPTION}\"}" > $${tmp} ;\
	zenroom -z -k $${tmp} announce_contracts/create_keys_and_pks.zen | tee ${SECRET}/keys.json && \
	rm -f $${tmp}

announce: SIGN_KEYRING ?= ${SECRET}/oracle_keyring.json
announce: ORACLE_KEYRING ?= ${SECRET}/keys.json
announce: ## Create and send a DID request for the oracle [SIGN_KEYRING, ORACLE_KEYRING]
	$(if $(wildcard ${SIGN_KEYRING}),,$(error Oracle admin keyring not found in SIGN_KEYRING=${SIGN_KEYRING}, cannot sign))
	$(if $(value ORACLE_KEYRING),,$(error Oracle keyring not found, add the path as ORACLE_KEYRING="<path>"))
	@tmp=$$(mktemp) ;\
	tmp2=$$(mktemp) ;\
	jq --arg ts $$(($$(date +%s%N)/1000000)) '.timestamp = $$ts' ${SIGN_KEYRING} > $${tmp} ;\
	jq -s '.[0] * .[1]' $${tmp} announce_contracts/announce.keys > $${tmp2}  ;\
	zenroom -z -k $${tmp2} -a ${ORACLE_KEYRING} announce_contracts/announce.zen > $${tmp} ;\
	restroom-test -s ${RR_SCHEMA} -h ${RR_HOST} -p ${RR_PORT} -u v1/sandbox/pubkeys-accept.chain -a $${tmp} | tee ${SECRET}/last_did.json ;\
	rm -f ${tmp} ${tmp2} ;\

run: ## Run the oracle container
	@docker run -d --name "${CONTAINER}" \
		--mount type=bind,source="$$(pwd)/secrets,target=/var/secrets" \
		--mount type=bind,source="$$(pwd)/contracts,target=/var/contracts" \
		-p 3000:3000 \
		zenswarm-oracle
kill: ## Stop the oracle container
	@docker kill zenswarm-oracle
	@docker rm zenswarm-oracle


goodbye: SIGN_KEYRING ?= ${SECRET}/oracle_keyring.json
goodbye: ORACLE_KEYRING ?= ${SECRET}/keys.json
goodbye: ## Oracle deannounce (deactivate DID) [SIGN_KEYRING, ORACLE_KEYRING]
	$(if $(wildcard ${SIGN_KEYRING}),,$(error Oracle admin keyring not found in SIGN_KEYRING=${SIGN_KEYRING}, cannot sign))
	$(if $(value ORACLE_KEYRING),,$(error Oracle keyring not found, add the path as ORACLE_KEYRING="<path>"))
	@tmp=$$(mktemp) ;\
	tmp2=$$(mktemp) ;\
	jq -s '.[0] * .[1]' ${SIGN_KEYRING} announce_contracts/goodbye.keys > $${tmp} ;\
	zenroom -z -k $${tmp} -a ${ORACLE_KEYRING} announce_contracts/goodbye.zen > $${tmp2} ;\
	cat $${tmp2} ;\
	restroom-test -s ${RR_SCHEMA} -h ${RR_HOST} -p ${RR_PORT} -u v1/sandbox/pubkeys-deactivate.chain -a $${tmp2} \
	| tee ${SECRET}/last_did_deactivated.json ;\
	rm -f $${tmp} $${tmp2}

##@ Image management
build:
	docker build -t zenswarm-oracle .

test_api:
	$(if $(value ZENCODE), ,$(error Enter the zencode api as ZENCODE="<api name>"))
	@if [ ! -z ${DATA} ]; then INPUT_DATA="-a $${DATA}"; fi; \
	restroom-test -p 3000 -u $${ZENCODE} $${INPUT_DATA}
