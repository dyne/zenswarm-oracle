RR_PORT := 9000
RR_HOST := localhost
RR_SCHEMA := http
RR_API := create_oracle.chain

SECRET ?= ./secrets
KEYS := keys.json

HOST ?= 0.0.0.0
PORT ?= 9000

help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' Makefile

##@ Oracle management
setup:
	@[ ! -x zenroom ] && \
		wget https://github.com/dyne/zenroom/releases/latest/download/zenroom -O zenroom && \
		chmod +x zenroom || exit 0
	@[ ! -x restroom-test ] && \
		wget https://github.com/dyne/zencode-tools/releases/latest/download/restroom-test -O restroom-test && \
		chmod +x restroom-test || exit 0

keygen: setup
keygen: ## Generate a new oracle keyring [DESCRIPTION]
	$(if $(value DESCRIPTION), ,$(error Enter the final description that will be present in yout DID doc as DESCRIPTION="<description>"))
	@[ -d ${SECRET} ] || mkdir ${SECRET} ;\
	if [ -f ${SECRET}/${KEYS} ]; then printf "Delete the old ${SECRET}/${KEYS} file\n"; exit 1; fi ;\
	tmp=$$(mktemp) ;\
	echo "{\"controller\": \"${DESCRIPTION}\"}" > $${tmp} ;\
	./zenroom -z -k $${tmp} announce_contracts/create_keys_and_pks.zen | tee ${SECRET}/keys.json && \
	rm -f $${tmp}

announce: ORACLE_KEYRING ?= ${SECRET}/keys.json
announce: ## Create and send a DID request for the oracle [ORACLE_KEYRING]
	$(if $(wildcard ${ORACLE_KEYRING}),,$(error Oracle keyring not found in ${ORACLE_KEYRING}, add the right path as ORACLE_KEYRING="<path>"))
	$(if $(value URL), ,$(error Enter the Oracle url as URL="<url>"))
	@tmp=$$(mktemp); \
	tmp3=$$(mktemp); \
	tmp2=$$(mktemp); \
	jq '.url = "${URL}"' announce_contracts/create_did.keys | tee $${tmp}; \
	./zenroom -z -k ${SECRET}/keys.json -a $${tmp} announce_contracts/create_did.zen | tee $${tmp3}; \
	./restroom-test -s ${RR_SCHEMA} -h ${RR_HOST} -p ${RR_PORT} -u ${RR_API} -a $${tmp3} \
		| tee $${tmp2} ;\
	jq '{DID: .DID}' $${tmp2} > ${SECRET}/DID.json; \
	curl -s $$(jq -r '.resolve_DID' $${tmp2}) | jq | tee ${SECRET}/DID_document.json; \
	rm -f $${tmp} $${tmp2} $${tmp3};

run: ORACLE_TYPE ?= common
run: ORACLE_NAME ?= zenswarm-oracle
run: ## Run the oracle container
	@[ -d logger ] || mkdir logger
	ORACLE_NAME=${ORACLE_NAME} PORT=${PORT} HOST=${HOST} ORACLE_TYPE=${ORACLE_TYPE} SECRETS=${SECRET} docker compose -p ${ORACLE_NAME} up

kill: ## Stop the oracle container
	@docker compose down

goodbye: ORACLE_KEYRING ?= ${SECRET}/keys.json
goodbye: ## Oracle deannounce (deactivate DID) [ORACLE_KEYRING]
	$(if $(wildcard ${ORACLE_KEYRING}),,$(error Oracle keyring not found in ${ORACLE_KEYRING}, add the right path as ORACLE_KEYRING="<path>"))
	@tmp=$$(mktemp); \
	./zenroom -z -a announce_contracts/deactivate_did.keys -k secrets/keys.json announce_contracts/deactivate_did.zen > $${tmp}; \
	./restroom-test -s https -h did.dyne.org -p 443 -u v1/sandbox/pubkeys-deactivate.chain -a $${tmp} \
		| jq '{DID: .result.didDocument.id}' \
		| tee ${SECRET}/last_did_deactivated.json ;\
	rm -f $${tmp};

##@ Image management
build:
	docker compose build

test_api:
	$(if $(value ZENCODE), ,$(error Enter the zencode api as ZENCODE="<api name>"))
	@if [ ! -z ${DATA} ]; then INPUT_DATA="-a $${DATA}"; fi; \
	./restroom-test -p 3000 -u $${ZENCODE} $${INPUT_DATA}
