
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2021-2023 Dyne.org foundation <foundation@dyne.org>.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

ARG NODE_VERSION=20
FROM node:$NODE_VERSION-alpine

WORKDIR /app

# Add dependencies
RUN apk add git python3 make g++

# Installing restroom
COPY ./restroom.mjs .
COPY ./package.json .
COPY ./yarn.lock .

# Configure restroom
ENV HTTP_PORT=80
ENV HTTPS_PORT=443
ENV LOCAL_PORT=3000
ENV OPENAPI=true
ENV CHAIN_EXT=chain
ENV YML_EXT=yml
ENV ZENCODE_DIR=/var/contracts
ENV FILES_DIR=/var/secrets

RUN mkdir -p /var/contracts
RUN mkdir -p /var/secrets
RUN yarn

# yarn install and run
CMD [ "yarn", "start" ]
